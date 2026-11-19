import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { Decoded } from "../../../utils/ContentHash.js";
import * as Impl from "./effect.js";

/**
 * Reads the content hash of an ENS name (ENSIP-7), decoded into its protocol, value and URI.
 *
 * **When to use**
 *
 * Use to find the website or content a name points to, such as an IPFS site.
 *
 * **Details**
 *
 * - Supports `ipfs`, `ipns`, `bzz` (Swarm), `onion`, `onion3`, `sia` (Skynet) and `ar` (Arweave).
 * - Turn the URI into an HTTP URL through the client's gateways with
 *   `ContentHash.toGatewayUrl(uri, ens.config.gateways)`.
 * - Returns `null` when the record is not set or cannot be decoded, unless `strict` is set.
 *
 * **Example** (Reading a website)
 *
 * ```ts
 * const site = await ens.record.getContentHash({ name: "vitalik.eth" })
 * site?.uri // "ipfs://…"
 * ```
 *
 * **Example** (Reading with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const site = await Actions.record.getContentHash(publicClient, { name: "vitalik.eth" })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const site = yield* Actions.record.getContentHash(ens, { name: "vitalik.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @throws `Errors.NotFoundError` (`RECORD_NOT_FOUND`, `RESOLVER_NOT_FOUND`) with `strict`.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) with `strict` when the resolver supports none of the records.
 * @throws `Errors.GatewayError` (`GATEWAY_REQUEST_FAILED`, `GATEWAY_RESPONSE_INVALID`, `OFFCHAIN_LOOKUP_INVALID`) when an off-chain gateway fails.
 * @throws `Errors.DnsError` when a DNS name's DNSSEC proof does not verify.
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
 *
 * @see {@link Actions.record.get} to read several records
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getContentHash(
  client: Like,
  options: getContentHash.Options,
): Promise<getContentHash.ReturnType> {
  return Action.promise("record.getContentHash", Impl.getContentHash, client, options);
}

export declare namespace getContentHash {
  /** Options for {@link getContentHash}. */
  type Options = Read.Options & {
    /** ENS name to read. Normalized automatically. */
    name: string;
  };
  /** The decoded content hash, or `null` when not set. */
  type ReturnType = Decoded | null;
  /** Errors {@link getContentHash} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnsupportedError
    | Errors.GatewayError
    | Errors.DnsError;
}

/** Builds a deferred read for `Actions.batch`. */
getContentHash.request = Action.request(
  "record.getContentHash",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getContentHash as Action.Declared<typeof Impl.getContentHash, getContentHash.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getContentHash.path = "record.getContentHash" as const;
