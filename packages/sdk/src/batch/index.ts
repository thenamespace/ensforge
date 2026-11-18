import type { Like } from "../client/types.js";
import type * as Errors from "../errors/index.js";
import * as Action from "../internal/action/index.js";
import * as Impl from "./effect.js";
import type { BatchOptions, RequestErrors, Requests, Results } from "./types.js";

/**
 * Runs several reads together, in as few round trips as possible.
 *
 * **When to use**
 *
 * Use to load a page's data at once: profiles, names, prices, permissions.
 *
 * **Details**
 *
 * - `requests` is a list (results come back as a tuple) or a record (results keep its keys).
 * - Contract reads coalesce into Multicall3 calls, per block; resolution reads (records, primary
 *   names) keep their Universal Resolver call, so CCIP-Read and off-chain names work.
 * - With `allowFailure` (default) each result is `{ status: "success", result }` or
 *   `{ status: "failure", error }`; with `allowFailure: false` the first failure rejects.
 * - Only reads with `.request` can be batched; writes combine with `Plan.merge`.
 *
 * **Example** (Loading a profile)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const { results } = await ens.batch({
 *   requests: {
 *     address: Actions.record.getAddress.request({ name: "nick.eth" }),
 *     avatar: Actions.record.getText.request({ name: "nick.eth", key: "avatar" }),
 *   },
 * })
 * ```
 *
 * **Example** (A list with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const { results: [state, primary] } = await Actions.batch(publicClient, {
 *   requests: [Actions.name.get.request({ name: "nick.eth" }), Actions.primaryName.get.request({ address })],
 *   allowFailure: false,
 * })
 * ```
 *
 * **Example** (Batching in an Effect program)
 *
 * ```ts
 * import { Actions as Requests } from "@ensforge/sdk"
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const { results } = yield* Actions.batch(ens, {
 *   requests: [Requests.name.get.request({ name: "nick.eth" })],
 * })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_RECORD_VALUE`) for a request that cannot be batched.
 * @throws The first request's error with `allowFailure: false`.
 *
 * @see {@link Actions.name.get} and every other read's `.request`
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function batch<const requests extends Requests, allowFailure extends boolean = true>(
  client: Like,
  options: BatchOptions<requests, allowFailure>,
): Promise<batch.ReturnType<requests, allowFailure>> {
  return Action.promise("batch", Impl.batch, client, options) as Promise<
    batch.ReturnType<requests, allowFailure>
  >;
}

export declare namespace batch {
  /** Options for {@link batch}. */
  type Options<
    requests extends Requests = Requests,
    allowFailure extends boolean = true,
  > = BatchOptions<requests, allowFailure>;
  /** Results in the requests' shape. */
  type ReturnType<requests extends Requests = Requests, allowFailure extends boolean = true> = {
    readonly results: Results<requests, allowFailure>;
  };
  /**
   * Errors {@link batch} can fail with: with `allowFailure: false`, a request that cannot be
   * batched and the requests' own errors; otherwise each failure is in its result.
   */
  type ErrorType<requests extends Requests = Requests, allowFailure extends boolean = true> =
    | Errors.CommonError
    | (allowFailure extends false ? Errors.InvalidInputError | RequestErrors<requests> : never);
  /** {@link batch} bound to a client. */
  type Bound = <const requests extends Requests, allowFailure extends boolean = true>(
    options: BatchOptions<requests, allowFailure>,
  ) => Promise<ReturnType<requests, allowFailure>>;
}
