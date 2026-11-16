import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  decodeFunctionResult,
  encodeFunctionData,
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

type CallOptions = Pick<Read.Options, "blockNumber" | "blockTag" | "gatewayUrls">;

/** Gateways to pass explicitly; empty means the Universal Resolver's own batch gateway. */
const gatewaysOf = (client: Client, options: CallOptions): readonly string[] => {
  const { ccipRead } = client.config;
  return options.gatewayUrls ?? (ccipRead === false ? [] : ccipRead.gatewayUrls);
};

/** `eth_call` to the Universal Resolver, following CCIP-Read unless the client disables it. */
const callUniversalResolver = (
  client: Client,
  data: Hex,
  functionName: string,
  options: CallOptions,
): Effect.Effect<Hex, AnyError> => {
  const universalResolver = universalResolverOf(client);
  const { ccipRead } = client.config;

  return fromPromise(
    () =>
      call(client.publicClient, {
        to: universalResolver,
        data,
        ...(ccipRead === false ? { ccipRead: false as const } : {}),
        ...(options.blockNumber === undefined
          ? { blockTag: options.blockTag ?? client.config.blockTag }
          : { blockNumber: options.blockNumber }),
      }),
    { contract: universalResolver, functionName },
  ).pipe(Effect.map((result) => result.data ?? "0x"));
};

/** Result of a Universal Resolver `resolve`. */
export type Resolved = {
  /** ABI-encoded return data of the resolver call. */
  readonly data: Hex;
  /** Resolver that answered. */
  readonly resolver: Address;
};

/**
 * ENSIP-10 resolution through the Universal Resolver: finds the resolver of `name` (including
 * wildcards) and calls it with `data`.
 */
export const resolve = (
  client: Client,
  options: { readonly name: string; readonly data: Hex } & CallOptions,
): Effect.Effect<Resolved, AnyError> => {
  const gateways = gatewaysOf(client, options);
  const name = dnsEncode(options.name);
  const callData =
    gateways.length === 0
      ? encodeFunctionData({
          abi: Abis.v2.universalResolver,
          functionName: "resolve",
          args: [name, options.data],
        })
      : encodeFunctionData({
          abi: Abis.v2.universalResolver,
          functionName: "resolveWithGateways",
          args: [name, options.data, gateways],
        });

  return callUniversalResolver(client, callData, "resolve", options).pipe(
    Effect.map((data) => {
      const [result, resolver] = decodeFunctionResult({
        abi: Abis.v2.universalResolver,
        functionName: "resolve",
        data,
      });
      return { data: result, resolver };
    }),
  );
};

/** Result of a Universal Resolver `reverse`. */
export type Reversed = {
  /** The primary name as stored; `""` when the reverse record is empty. */
  readonly name: string;
  /** Resolver of the primary name, which confirmed the address. */
  readonly resolver: Address;
  /** Resolver of the reverse name. */
  readonly reverseResolver: Address;
};

/**
 * ENSIP-19 primary name of an address, forward-verified by the Universal Resolver: it fails with
 * `ReverseAddressMismatch` when the name does not resolve back to the address.
 */
export const reverse = (
  client: Client,
  options: { readonly address: Address; readonly coinType: bigint } & CallOptions,
): Effect.Effect<Reversed, AnyError> => {
  const gateways = gatewaysOf(client, options);
  const callData =
    gateways.length === 0
      ? encodeFunctionData({
          abi: Abis.v2.universalResolver,
          functionName: "reverse",
          args: [options.address, options.coinType],
        })
      : encodeFunctionData({
          abi: Abis.v2.universalResolver,
          functionName: "reverseWithGateways",
          args: [options.address, options.coinType, gateways],
        });

  return callUniversalResolver(client, callData, "reverse", options).pipe(
    Effect.map((data) => {
      const [name, resolver, reverseResolver] = decodeFunctionResult({
        abi: Abis.v2.universalResolver,
        functionName: "reverse",
        data,
      });
      return { name, resolver, reverseResolver };
    }),
  );
};

/** The resolver the Universal Resolver reads from. */
export type FoundResolver = {
  readonly address: Address;
  /** Whether it was found on a parent (an ENSIP-10 wildcard). */
  readonly inherited: boolean;
};

/**
 * The resolver the Universal Resolver reads `name` from, or `null` when there is none. Never use
 * it as a write target: for names still on ENSv1, the ENSv2 Universal Resolver returns the
 * read-only `ENSV1Resolver` bridge rather than the name's own resolver.
 */
export const findResolver = (
  client: Client,
  options: { readonly name: string } & Read.BlockOptions,
): Effect.Effect<FoundResolver | null, AnyError> =>
  readContract(client, {
    address: universalResolverOf(client),
    abi: Abis.v2.universalResolver,
    functionName: "findResolver",
    args: [dnsEncode(options.name)],
    ...(options.blockNumber === undefined
      ? { blockTag: options.blockTag }
      : { blockNumber: options.blockNumber }),
  }).pipe(
    Effect.map(([address, , offset]) =>
      address === zeroAddress ? null : { address, inherited: offset !== 0n },
    ),
  );
