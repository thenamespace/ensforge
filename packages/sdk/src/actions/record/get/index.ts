import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";
import type { Records, Selection } from "./types.js";

export type { AbiRecord, Records, Selection } from "./types.js";

/**
 * Reads any mix of a name's records in one request: texts, addresses, content hash, ABI, public
 * key, name record, interface implementers and data records.
 *
 * **When to use**
 *
 * Use to load a profile or several records at once. Use `record.getText` or
 * `record.getAddress` for a single value.
 *
 * **Details**
 *
 * - One Universal Resolver call, whatever the selection (ENSv1, ENSv2, wildcard and off-chain
 *   names). ENSv1 names answered through the ENSv1 bridge cost one more batched call, to report
 *   the ENSv1 resolver behind it in `resolver`.
 * - The result has exactly the selected fields: `texts.url` exists only when `"url"` was
 *   requested.
 * - Missing records are `null`. A missing resolver gives `resolver: null` and every record `null`,
 *   unless `strict` is set.
 * - EVM chain addresses fall back to the default EVM address (ENSIP-19).
 *
 * **Example** (Loading a profile)
 *
 * ```ts
 * const profile = await ens.record.get({ name: "nick.eth", texts: ["avatar", "url"], addresses: ["eth", "btc"] })
 * profile.texts.url // string | null
 * ```
 *
 * **Example** (Reading with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const { contentHash } = await Actions.record.get(publicClient, { name: "vitalik.eth", contentHash: true })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const records = yield* Actions.record.get(ens, { name: "nick.eth", texts: ["url"] })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_COIN_TYPE`) for invalid input.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) with `strict` when the name has no resolver.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) with `strict` when the resolver supports none of the records.
 * @throws `Errors.GatewayError` when an off-chain gateway fails.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.record.set} to write records
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get<const selection extends Selection>(
  client: Like,
  options: get.Options & selection,
): Promise<get.ReturnType<selection>> {
  return Action.promise("record.get", Impl.get, client, options) as Promise<
    get.ReturnType<selection>
  >;
}

export declare namespace get {
  /** Options for {@link get}; add the records to read (see `Selection`). */
  type Options = Read.Options &
    Selection & {
      /** ENS name to read. Normalized automatically. */
      name: string;
    };
  /** The selected records. */
  type ReturnType<selection extends Selection = Selection> = Records<selection>;
  /** Errors {@link get} can fail with. */
  type ErrorType = AnyError;
  /** {@link get} bound to a client, keeping the result narrowed to the selection. */
  type Bound = <const selection extends Selection>(
    options: Options & selection,
  ) => Promise<ReturnType<selection>>;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request("record.get", Impl.get);

/** Path of the action, e.g. for cache keys. */
get.path = "record.get" as const;
