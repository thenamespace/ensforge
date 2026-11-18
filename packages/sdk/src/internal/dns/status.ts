import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";

import type { ImportAction, Proof, Status } from "../../actions/dns/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { nonZeroAddress, sameAddress } from "../address.js";
import type { NameParts } from "../name/parts.js";
import { requireV1Contracts } from "../name/write.js";
import * as Rpc from "../rpc/index.js";
import { fetchTxtProof, gatewayUrls, ownerFromTxt, verifiesOnChain } from "./proof.js";

/**
 * Reads the import state of a DNS name: its ENSv1 registry owner and last imported inception,
 * and the current DNSSEC proof of its `_ens` TXT record, verified against the on-chain oracle.
 */
export const readDnsStatus = Effect.fnUntraced(function* (
  client: Client,
  parts: NameParts,
  urls: readonly string[] | undefined,
): Effect.fn.Return<{ readonly status: Status; readonly proof: Proof }, AnyError> {
  const contracts = yield* requireV1Contracts(client);
  const { proof, registryOwner, inception } = yield* Effect.all(
    {
      proof: gatewayUrls(client, urls).pipe(
        Effect.flatMap((resolved) => fetchTxtProof(client, `_ens.${parts.name}`, resolved)),
      ),
      registryOwner: Rpc.readContract(client, {
        address: contracts.registry,
        abi: Abis.v1.ensRegistry,
        functionName: "owner",
        args: [parts.node],
      }),
      inception: Rpc.readContract(client, {
        address: contracts.dnsRegistrar,
        abi: Abis.v1.dnsRegistrar,
        functionName: "inceptions",
        args: [parts.node],
      }),
    },
    { concurrency: "unbounded" },
  );
  const proofValid = yield* verifiesOnChain(client, contracts.dnssecOracle, proof);

  const owner = nonZeroAddress(registryOwner);
  const dnsOwner = ownerFromTxt(proof.txt);
  const action: ImportAction =
    dnsOwner === null
      ? "set-txt-record"
      : !proofValid
        ? "proof-invalid"
        : sameAddress(owner, dnsOwner)
          ? "none"
          : "claim";

  return {
    proof,
    status: {
      name: parts.name,
      imported: owner !== null,
      owner,
      dnsOwner,
      proofValid,
      importedInception: inception === 0 ? null : inception,
      proofInception: proof.inception,
      action,
    },
  };
});
