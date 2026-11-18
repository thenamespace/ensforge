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
import { ConfigError } from "../../errors/classes/ConfigError.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { dnsEncode } from "../../utils/Name.js";
import { toAnyError } from "../anyError.js";
import { universalResolverOf } from "../deployment.js";
import { blockAt } from "./block.js";
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
    (signal) =>
      // viem reads `ccipRead` from the client, not from the call. The signal fires when the read
      // is interrupted (an aborted Promise call), and cancels the gateway requests in flight.
      call(ccipRead === false ? { ...client.publicClient, ccipRead: false } : client.publicClient, {
        to: universalResolver,
        data,
        requestOptions: { signal },
        ...(options.blockNumber === undefined
          ? { blockTag: options.blockTag ?? client.config.blockTag }
          : { blockNumber: options.blockNumber }),
      }),
    { contract: universalResolver, functionName },
  ).pipe(
    // `resolve` and `reverse` always return data: none means no code at the read block (a block
    // before the Universal Resolver was deployed, or a profile for another chain).
    Effect.flatMap((result) =>
      result.data === undefined || result.data === "0x"
        ? Effect.fail(
            new ConfigError({
              code: "CONTRACT_NOT_DEPLOYED",
              context: { contract: universalResolver, functionName },
            }),
          )
        : Effect.succeed(result.data),
    ),
  );
};

/**
 * Result of a Universal Resolver `resolve`.
 *
 * @stability unstable
 */
export type Resolved = {
  /** ABI-encoded return data of the resolver call. */
  readonly data: Hex;
  /** Resolver that answered. */
  readonly resolver: Address;
};

/**
 * ENSIP-10 resolution through the Universal Resolver: finds the resolver of `name` (including
 * wildcards) and calls it with `data`.
 *
 * @stability unstable
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

/**
 * Result of a Universal Resolver `reverse`.
 *
 * @stability unstable
 */
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
 *
 * @stability unstable
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

/**
 * The resolver the Universal Resolver reads from.
 *
 * @stability unstable
 */
export type FoundResolver = {
  readonly address: Address;
  /** Whether it was found on a parent (an ENSIP-10 wildcard). */
  readonly inherited: boolean;
};

/**
 * The resolver the Universal Resolver reads `name` from, or `null` when there is none. Never use
 * it as a write target: for names still on ENSv1, the ENSv2 Universal Resolver returns the
 * read-only `ENSV1Resolver` bridge rather than the name's own resolver.
 *
 * @stability unstable
 */
export const findResolver = (
  client: Client,
  options: { readonly name: string } & Read.BlockOptions,
): Effect.Effect<FoundResolver | null, AnyError> =>
  // `dnsEncode` throws `INVALID_NAME`; inside the Effect it is a typed failure, not a defect.
  Effect.try({ try: () => dnsEncode(options.name), catch: toAnyError }).pipe(
    Effect.flatMap((dns) =>
      readContract(client, {
        address: universalResolverOf(client),
        abi: Abis.v2.universalResolver,
        functionName: "findResolver",
        args: [dns],
        ...blockAt(options),
      }),
    ),
    Effect.map(([address, , offset]) =>
      address === zeroAddress ? null : { address, inherited: offset !== 0n },
    ),
  );
