import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual, zeroAddress } from "viem";

import type { Client } from "../../../client/types.js";
import { DnsError } from "../../../errors/classes/DnsError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { parseDnsName } from "../../../internal/dns/name.js";
import { fetchTxtProof, gatewayUrls, ownerFromTxt, toProof } from "../../../internal/dns/proof.js";
import {
  requireAddress,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { addressOf } from "../../../internal/write/signer.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { claim as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.dns.claim`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const parts = yield* parseDnsName(options.name);
  const contracts = yield* requireV1Contracts(client);
  const resolver =
    options.resolver === undefined
      ? undefined
      : yield* requireAddress(options.resolver, "resolver");

  const proofName = `_ens.${parts.name}`;
  const given = options.proof;
  const proof =
    given === undefined
      ? yield* gatewayUrls(client, options.gatewayUrls).pipe(
          Effect.flatMap((urls) => fetchTxtProof(client, proofName, urls)),
        )
      : yield* Effect.try({
          try: () => toProof(proofName, given.rrsets),
          catch: (cause) =>
            new InvalidInputError({ code: "INVALID_RECORD_VALUE", field: "proof", cause }),
        });
  const dnsOwner = ownerFromTxt(proof.txt);
  if (dnsOwner === null) return yield* Effect.fail(new DnsError({ code: "DNS_RECORD_MISSING" }));

  // DNSRegistrar only accepts proofs at least as recent as the last one it imported.
  const importedInception = yield* Rpc.readContract(client, {
    address: contracts.dnsRegistrar,
    abi: Abis.v1.dnsRegistrar,
    functionName: "inceptions",
    args: [parts.node],
  });
  if (importedInception > proof.inception) {
    return yield* Effect.fail(new DnsError({ code: "PROOF_STALE" }));
  }
  const signer = addressOf(options.account) ?? client.account;
  if (resolver !== undefined && signer !== undefined && !isAddressEqual(signer, dnsOwner)) {
    return yield* Effect.fail(
      new UnauthorizedError({
        code: "NOT_OWNER",
        account: signer,
        shortMessage: `Only the DNS owner (${dnsOwner}) can claim with a resolver.`,
        hint: "Claim without `resolver`, then set it as the owner.",
      }),
    );
  }

  const data =
    resolver === undefined
      ? encodeFunctionData({
          abi: Abis.v1.dnsRegistrar,
          functionName: "proveAndClaim",
          args: [parts.dns, proof.rrsets],
        })
      : encodeFunctionData({
          abi: Abis.v1.dnsRegistrar,
          functionName: "proveAndClaimWithResolver",
          // DNSRegistrar can also set an address record, but public resolvers do not let it.
          args: [parts.dns, proof.rrsets, resolver, zeroAddress],
        });

  return singleStepPlan(client, {
    operation: "dns.claim",
    account: options.account,
    description: "Claim DNS name",
    calls: [{ to: contracts.dnsRegistrar, data, value: 0n }],
  });
});

const write = Action.write("dns.claim", plan, { contractKind: "registrar" });

/** @internal Implementation of `Actions.dns.claim`. */
export const claim = write.send;

/** @internal Implementation of `Actions.dns.claimSync`. */
export const claimSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.dns.claim`. */
export const claimMethods = write.methods;
