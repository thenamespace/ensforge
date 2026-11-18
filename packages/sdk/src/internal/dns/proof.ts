import { Effect, Array as Arr, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  ccipRequest,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
} from "viem";

import type { OffchainResolver, Proof, SignedRRSet } from "../../actions/dns/types.js";
import type { Client } from "../../client/types.js";
import { GatewayError } from "../../errors/classes/GatewayError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import { dnsEncode } from "../../utils/Name.js";
import * as Rpc from "../rpc/index.js";
import { parseSignedSet, RecordType, txtStrings, type SignedSet } from "./wire.js";

/** Gateway URLs: the caller's, or those the deployment's DNSSEC gateway provider lists. */
export const gatewayUrls = (
  client: Client,
  override: readonly string[] | undefined,
): Effect.Effect<readonly string[], AnyError> => {
  if (override !== undefined && override.length > 0) return Effect.succeed(override);

  const provider = client.deployment.v2?.dns?.gatewayProvider;
  if (provider === undefined) {
    return Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_ON_DEPLOYMENT",
        feature: "DNSSEC gateways",
        hint: "Pass `gatewayUrls`.",
      }),
    );
  }
  return Rpc.readContract(client, {
    address: provider,
    abi: Abis.v2.dnssecGatewayProvider,
    functionName: "gateways",
  });
};

/** The TXT records of `name` in a signed RRSet, each as its character-strings. */
const txtRecordsIn = (name: string, signed: SignedSet): string[][] =>
  signed.typeCovered === RecordType.txt
    ? Arr.map(
        Arr.filter(
          signed.records,
          (record) => record.type === RecordType.txt && record.name === name,
        ),
        (record) => txtStrings(record.data),
      )
    : [];

/** Proof built from signed RRSets, reading the TXT strings of `name` from the last one. */
export const toProof = (name: string, rrsets: readonly SignedRRSet[]): Proof => {
  // Gateways answer a missing record with an empty RRSet.
  const last = rrsets.at(-1);
  if (last === undefined || last.rrset === "0x") {
    return { name, rrsets, inception: 0, expiration: 0, txt: [] };
  }

  const signed = parseSignedSet(last.rrset);
  return {
    name,
    rrsets,
    inception: signed.inception,
    expiration: signed.expiration,
    txt: txtRecordsIn(name, signed).flat(),
  };
};

/**
 * The TXT records of a proof, each joined from its character-strings: DNS splits values over 255
 * bytes, and the DNS TLD resolver reads an `ENS1` record whole.
 */
export const txtRecords = (proof: Proof): string[] => {
  const last = proof.rrsets.at(-1);
  if (last === undefined || last.rrset === "0x") return [];
  return Arr.map(txtRecordsIn(proof.name, parseSignedSet(last.rrset)), (strings) =>
    Arr.join(strings, ""),
  );
};

/**
 * Fetches the DNSSEC proof of the TXT records of `name` from a DNSSEC gateway (ENSIP-17
 * `IDNSGateway.resolve`), trying each URL in order.
 */
export const fetchTxtProof = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  urls: readonly string[],
): Effect.fn.Return<Proof, AnyError> {
  const data = encodeFunctionData({
    abi: Abis.shared.dnssecGateway,
    functionName: "resolve",
    args: [dnsEncode(name), RecordType.txt],
  });
  const ccipRead = client.publicClient.ccipRead;
  const request = (ccipRead === false ? undefined : ccipRead?.request) ?? ccipRequest;

  // The gateway answers any sender; there is no calling contract to name.
  const response = yield* Effect.tryPromise({
    try: () => request({ data, sender: zeroAddress, urls: [...urls] }),
    catch: (cause) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- viem's HTTP errors carry `status` and `url`
      const http = cause as { readonly status?: number; readonly url?: string };
      return new GatewayError({
        code: "GATEWAY_REQUEST_FAILED",
        status: http.status,
        url: http.url ?? Arr.join(urls, ", "),
        cause,
      });
    },
  });

  return yield* Effect.try({
    try: () =>
      toProof(
        name,
        decodeFunctionResult({
          abi: Abis.shared.dnssecGateway,
          functionName: "resolve",
          data: response,
        }),
      ),
    catch: (cause) =>
      new GatewayError({ code: "GATEWAY_RESPONSE_INVALID", url: Arr.join(urls, ", "), cause }),
  });
});

/** Whether the proof verifies against the deployment's DNSSEC oracle at the current block. */
export const verifiesOnChain = (
  client: Client,
  oracle: Address,
  proof: Proof,
): Effect.Effect<boolean, AnyError> =>
  Rpc.readContract(client, {
    address: oracle,
    abi: Abis.v1.dnssecOracle,
    functionName: "verifyRRSet",
    args: [proof.rrsets],
  }).pipe(
    Effect.as(true),
    // DNSSEC errors are translated to `DnsError`; any other revert also means "does not verify".
    Effect.catchIf(
      (error) => error._tag === "DnsError" || error._tag === "ContractRevertError",
      () => Effect.succeed(false),
    ),
  );

/** The owner in a `_ens` TXT record (`a=0x…`), parsed the way `DNSRegistrar` parses it. */
export const ownerFromTxt = (txt: readonly string[]): Address | null => {
  for (const value of txt) {
    if (!Str.startsWith("a=0x")(value)) continue;
    const address = Str.slice(2)(value);
    if (isAddress(address, { strict: false })) return getAddress(address);
  }
  return null;
};

/** The `ENS1 <resolver> [context]` TXT records, in order. */
export const offchainResolversFromTxt = (txt: readonly string[]): OffchainResolver[] =>
  Arr.flatMap(txt, (value) => {
    if (!Str.startsWith("ENS1 ")(value)) return [];
    const [resolver, ...rest] = Str.split(" ")(Str.trim(Str.slice(5)(value)));
    if (resolver === "") return [];
    const context = Str.trim(Arr.join(rest, " "));
    return [{ resolver, context: context === "" ? null : context }];
  });
