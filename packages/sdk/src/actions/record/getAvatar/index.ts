import type { Gateways, Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads the avatar of an ENS name and resolves it to a URL a browser can load (ENSIP-12).
 *
 * **When to use**
 *
 * Use to show a profile picture for a name.
 *
 * **Details**
 *
 * - `http(s)` and `data:` URIs are returned as-is; `ipfs://`, `ipns://`, `ar://` and bare CIDs go
 *   through `gateways`: the call's, else the client's (`Ensforge.create({ gateways })`), else
 *   `https://ipfs.io` and `https://arweave.net`.
 * - NFT avatars (`eip155:1/erc721:…/…`, `erc1155`) read the token's metadata and return its image.
 *   They resolve only on the client's own chain, and only when the name's ETH address owns the
 *   token (ENSIP-12): `ownerOf` for ERC-721, a non-zero balance for ERC-1155.
 * - Returns `null` when the avatar is not set or cannot be loaded, unless `strict` is set.
 *
 * **Gotchas**
 *
 * - The public `ipfs.io` gateway is rate limited (HTTP 429 under load): set your own gateway in
 *   production.
 *
 * **Example** (Showing a profile picture)
 *
 * ```ts
 * const src = await ens.record.getAvatar({ name: "nick.eth" })
 * ```
 *
 * **Example** (Using your own IPFS gateway)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const src = await Actions.record.getAvatar(publicClient, { name: "nick.eth", gateways: { ipfs: "https://gateway.pinata.cloud" } })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const src = yield* Actions.record.getAvatar(ens, { name: "nick.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @throws `Errors.NotFoundError` (`RECORD_NOT_FOUND`, `RESOLVER_NOT_FOUND`) with `strict`.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) with `strict` when the resolver supports none of the records.
 * @throws `Errors.GatewayError` (`GATEWAY_REQUEST_FAILED`, `GATEWAY_RESPONSE_INVALID`) with `strict` when NFT metadata cannot be loaded.
 * @throws `Errors.DnsError` when a DNS name's DNSSEC proof does not verify.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.record.getText} to read the raw avatar record
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getAvatar(client: Like, options: getAvatar.Options): Promise<getAvatar.ReturnType> {
  return Action.promise("record.getAvatar", Impl.getAvatar, client, options);
}

export declare namespace getAvatar {
  /** Options for {@link getAvatar}. */
  type Options = Read.Options & {
    /** ENS name to read. Normalized automatically. */
    name: string;
    /** HTTP gateways for IPFS and Arweave content, overriding the client's `gateways`. */
    gateways?: Gateways | undefined;
    /**
     * Milliseconds to wait for NFT metadata.
     *
     * @default 10000
     */
    timeout?: number | undefined;
  };
  /** An `http(s)` or `data:` URL, or `null`. */
  type ReturnType = string | null;
  /** Errors {@link getAvatar} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnsupportedError
    | Errors.GatewayError
    | Errors.DnsError;
}

/** Builds a deferred read for `Actions.batch`. */
getAvatar.request = Action.request(
  "record.getAvatar",
  Impl.getAvatar as Action.Declared<typeof Impl.getAvatar, getAvatar.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getAvatar.path = "record.getAvatar" as const;
