import { Effect, Array as Arr, Fiber, Option } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { fromRevertData } from "../anyError.js";
import { nameParts } from "../name/parts.js";
import * as Rpc from "../rpc/index.js";

/** Results of resolving several record calls at once. */
export type Resolved = {
  /** Resolver that answered, or `null` when the name has none. */
  readonly resolver: Address | null;
  /** ABI-encoded result per call; `undefined` when that call failed or the record is unsupported. */
  readonly results: readonly (Hex | undefined)[];
};

// Missing resolvers and missing profiles mean "no records"; strict reads surface them instead.
const noRecordCodes = new Set(["RESOLVER_NOT_FOUND", "RESOLVER_PROFILE_UNSUPPORTED"]);

type ResolveOptions = { readonly name: string; readonly calls: readonly Hex[] } & Pick<
  Read.Options,
  "blockNumber" | "blockTag" | "gatewayUrls" | "strict"
>;

/**
 * Resolves several resolver calls for one name where it lives: on its L2 for a name in an L2
 * namespace the client reaches, else through the Universal Resolver. The Ethereum read starts at
 * once and is dropped when the name turns out to live on an L2, so ENS names cost no extra round.
 * Reads at a past block stay on Ethereum: its block numbers mean nothing on an L2.
 */
export const resolveCalls = Effect.fnUntraced(function* (
  client: Client,
  options: ResolveOptions,
): Effect.fn.Return<Resolved, AnyError> {
  const ethereum = yield* Effect.forkChild(resolveOnEthereum(client, options));
  if (options.blockNumber !== undefined) return yield* Fiber.join(ethereum);

  const parts = nameParts(options.name);
  const { l2ReadTarget } = yield* Effect.promise(() => import("../name/location.js"));
  const target = yield* l2ReadTarget(client, parts, { blockTag: options.blockTag }, options.strict);
  if (target === null) return yield* Fiber.join(ethereum);

  yield* Fiber.interrupt(ethereum);
  const { resolveOnL2 } = yield* Effect.promise(() => import("../namespace/l2/index.js"));
  return yield* resolveOnL2(target.client, target.location, parts, options.calls, options.strict);
});

/**
 * Resolves several resolver calls for one name in a single Universal Resolver request, as
 * `resolve(name, multicall(calls))`. One call is sent as-is.
 */
const resolveOnEthereum = Effect.fnUntraced(function* (
  client: Client,
  options: ResolveOptions,
): Effect.fn.Return<Resolved, AnyError> {
  const single = options.calls.length === 1;
  const data = single
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the collection is known to be non-empty or the index in range here; `noUncheckedIndexedAccess` cannot see it
      (options.calls[0] as Hex)
    : encodeFunctionData({
        abi: Abis.shared.multicallResolver,
        functionName: "multicall",
        args: [options.calls],
      });

  const resolved = yield* Rpc.resolve(client, { ...options, data }).pipe(
    Effect.catchIf(
      (error: AnyError) => options.strict !== true && noRecordCodes.has(error.code),
      () => Effect.undefined,
    ),
  );
  if (resolved === undefined)
    return { resolver: null, results: Arr.map(options.calls, () => undefined) };

  const results = single
    ? [resolved.data]
    : decodeFunctionResult({
        abi: Abis.shared.multicallResolver,
        functionName: "multicall",
        data: resolved.data,
      });

  // A successful result is ABI-encoded data: non-empty and 32-byte aligned. A failed call returns
  // revert data, which starts with a 4-byte selector (as ensjs checks too).
  const answered = Arr.map(results, (result) =>
    result !== "0x" && (result.length - 2) % 64 === 0 ? result : undefined,
  );
  // When no call is answered, the read ends as a single call would, with the most telling failure
  // (a gateway failure, no reachable resolver) over a missing profile; a missing resolver or
  // profile is an error only for strict reads.
  if (!single && Arr.every(answered, (result) => result === undefined)) {
    const unsupported = new UnsupportedError({ code: "RESOLVER_PROFILE_UNSUPPORTED" });
    const failures = yield* Effect.forEach(
      results,
      (result) =>
        result === "0x"
          ? Effect.undefined
          : fromRevertData(result, { contract: resolved.resolver, contractKind: "resolver" }),
      { concurrency: "unbounded" },
    );
    const error =
      Option.getOrUndefined(
        Arr.findFirst(
          failures,
          (failure) =>
            failure !== undefined &&
            failure._tag !== "ContractRevertError" &&
            failure.code !== "RESOLVER_PROFILE_UNSUPPORTED",
        ),
      ) ?? unsupported;
    if (options.strict === true || !noRecordCodes.has(error.code)) return yield* Effect.fail(error);
  }
  return { resolver: resolved.resolver, results: answered };
});
