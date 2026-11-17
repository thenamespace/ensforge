import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import { fromRevert } from "../../errors/translate/revert.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
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

/**
 * Resolves several resolver calls for one name in a single Universal Resolver request, as
 * `resolve(name, multicall(calls))`. One call is sent as-is.
 */
export const resolveCalls = Effect.fnUntraced(function* (
  client: Client,
  options: { readonly name: string; readonly calls: readonly Hex[] } & Pick<
    Read.Options,
    "blockNumber" | "blockTag" | "gatewayUrls" | "strict"
  >,
): Effect.fn.Return<Resolved, AnyError> {
  const single = options.calls.length === 1;
  const data = single
    ? (options.calls[0] as Hex)
    : encodeFunctionData({
        abi: Abis.shared.multicallResolver,
        functionName: "multicall",
        args: [options.calls],
      });

  const resolved = yield* Rpc.resolve(client, { ...options, data }).pipe(
    Effect.catchIf(
      (error: AnyError) => !options.strict && noRecordCodes.has(error.code),
      () => Effect.undefined,
    ),
  );
  if (resolved === undefined)
    return { resolver: null, results: options.calls.map(() => undefined) };

  const results = single
    ? [resolved.data]
    : decodeFunctionResult({
        abi: Abis.shared.multicallResolver,
        functionName: "multicall",
        data: resolved.data,
      });

  // A successful result is ABI-encoded data: non-empty and 32-byte aligned. A failed call returns
  // revert data, which starts with a 4-byte selector (as ensjs checks too).
  const answered = results.map((result) =>
    result !== "0x" && (result.length - 2) % 64 === 0 ? result : undefined,
  );
  // When no call is answered, the read ends as a single call would, with the most telling failure
  // (a gateway failure, no reachable resolver) over a missing profile; a missing resolver or
  // profile is an error only for strict reads.
  if (!single && answered.every((result) => result === undefined)) {
    const unsupported = new UnsupportedError({ code: "RESOLVER_PROFILE_UNSUPPORTED" });
    const error =
      results
        .map((result) =>
          result === "0x"
            ? undefined
            : (fromRevert({ data: result }, { contract: resolved.resolver }) as AnyError),
        )
        .find(
          (failure) =>
            failure !== undefined &&
            failure._tag !== "ContractRevertError" &&
            failure.code !== "RESOLVER_PROFILE_UNSUPPORTED",
        ) ?? unsupported;
    if (options.strict || !noRecordCodes.has(error.code)) return yield* Effect.fail(error);
  }
  return { resolver: resolved.resolver, results: answered };
});
