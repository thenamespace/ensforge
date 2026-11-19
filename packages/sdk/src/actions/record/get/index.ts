import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
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
 *   names), with a batched `findResolver` alongside it that tells whether the name lives on an L2.
 *   ENSv1 names answered through the ENSv1 bridge cost one more batched call, to report the ENSv1
 *   resolver behind it in `resolver`.
 * - The result has exactly the selected fields: `texts.url` exists only when `"url"` was
 *   requested.
 * - Missing records are `null`. A missing resolver gives `resolver: null` and every record `null`,
 *   unless `strict` is set.
 * - EVM chain addresses fall back to the default EVM address (ENSIP-19).
 * - Names in an L2 namespace (`jesse.base.eth`) are read from their resolver on the L2, at its
 *   latest block, and `resolver` is that resolver. Without a transport or public RPC for the L2,
 *   they are read through Ethereum's gateway instead. Reads at a past `blockNumber` always use
 *   Ethereum.
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
 * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) with `strict` when the name lives on an L2 the client cannot reach.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) with `strict` when the resolver supports none of the records.
 * @throws `Errors.GatewayError` (`GATEWAY_REQUEST_FAILED`, `GATEWAY_RESPONSE_INVALID`, `OFFCHAIN_LOOKUP_INVALID`) when an off-chain gateway fails.
 * @throws `Errors.DnsError` when a DNS name's DNSSEC proof does not verify.
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
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
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnsupportedError
    | Errors.GatewayError
    | Errors.DnsError;
  /** {@link get} bound to a client, keeping the result narrowed to the selection. */
  type Bound = <const selection extends Selection>(
    options: Options & selection,
  ) => Promise<ReturnType<selection>>;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request(
  "record.get",
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion, typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws; dropping it changes the generic request type
  Impl.get as Action.Declared<typeof Impl.get, get.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
get.path = "record.get" as const;
