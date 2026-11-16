import { Effect } from "effect";

import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { call } from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { dnsEncode } from "../../utils/Name.js";
import { universalResolverOf } from "../deployment.js";
import { fromPromise } from "./fromPromise.js";
import { readContract } from "./readContract.js";

// Only the entry points ensforge calls; errors are decoded separately against every ENS error.
const universalResolverAbi = /* @__PURE__ */ parseAbi([
  "function resolve(bytes name, bytes data) view returns (bytes, address)",
  "function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes, address)",
  "function findResolver(bytes name) view returns (address resolver, bytes32 node, uint256 offset)",
]);

/** Result of a Universal Resolver `resolve`. */
export type Resolved = {
  /** ABI-encoded return data of the resolver call. */
  readonly data: Hex;
  /** Resolver that answered. */
  readonly resolver: Address;
};

/**
 * ENSIP-10 resolution through the Universal Resolver: finds the resolver of `name` (including
 * wildcards) and calls it with `data`, following CCIP-Read unless the client disables it.
 */
export const resolve = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly name: string;
    readonly data: Hex;
  } & Pick<Read.Options, "blockNumber" | "blockTag" | "gatewayUrls">,
) {
  const universalResolver = universalResolverOf(client);
  const { ccipRead } = client.config;
  const gateways = options.gatewayUrls ?? (ccipRead === false ? [] : ccipRead.gatewayUrls);
  const callData =
    gateways.length === 0
      ? encodeFunctionData({
          abi: universalResolverAbi,
          functionName: "resolve",
          args: [dnsEncode(options.name), options.data],
        })
      : encodeFunctionData({
          abi: universalResolverAbi,
          functionName: "resolveWithGateways",
          args: [dnsEncode(options.name), options.data, gateways],
        });

  const { data } = yield* fromPromise(
    () =>
      call(client.publicClient, {
        to: universalResolver,
        data: callData,
        ...(ccipRead === false ? { ccipRead: false as const } : {}),
        ...(options.blockNumber === undefined
          ? { blockTag: options.blockTag ?? client.config.blockTag }
          : { blockNumber: options.blockNumber }),
      }),
    { contract: universalResolver, functionName: "resolve" },
  );

  const [result, resolver] = decodeFunctionResult({
    abi: universalResolverAbi,
    functionName: "resolve",
    data: data ?? "0x",
  });
  return { data: result, resolver } satisfies Resolved;
}) as (
  client: Client,
  options: { readonly name: string; readonly data: Hex } & Pick<
    Read.Options,
    "blockNumber" | "blockTag" | "gatewayUrls"
  >,
) => Effect.Effect<Resolved, AnyError>;

/** Resolver address of `name` (including wildcard parents), or `null` when it has none. */
export const findResolver = (
  client: Client,
  options: { readonly name: string } & Read.BlockOptions,
): Effect.Effect<Address | null, AnyError> =>
  readContract(client, {
    address: universalResolverOf(client),
    abi: universalResolverAbi,
    functionName: "findResolver",
    args: [dnsEncode(options.name)],
    ...(options.blockNumber === undefined
      ? { blockTag: options.blockTag }
      : { blockNumber: options.blockNumber }),
  }).pipe(Effect.map(([resolver]) => (resolver === zeroAddress ? null : resolver)));
