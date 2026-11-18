import { String as Str, Record as Rec, Array as Arr, Option } from "effect";

import {
  decode as decodeContentHash,
  encode as encodeContentHash,
  getCodec,
  type Codec,
} from "@ensdomains/content-hash";
import type { Hex } from "viem";

import type { Gateways } from "../client/types.js";
import { InvalidInputError } from "../errors/classes/InvalidInputError.js";
import { resolveGateways } from "../internal/gateways.js";

/** URI scheme ↔ content-hash codec. */
const schemes = {
  ipfs: "ipfs",
  ipns: "ipns",
  bzz: "swarm",
  onion: "onion",
  onion3: "onion3",
  sia: "skynet",
  ar: "arweave",
} as const satisfies Readonly<Record<string, Codec>>;

/**
 * URI scheme of a supported content hash, e.g. `ipfs` in `ipfs://bafy…`.
 *
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export type Protocol = keyof typeof schemes;

/**
 * A decoded content hash.
 *
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export type Decoded = {
  readonly protocol: Protocol;
  /** The identifier without scheme, e.g. a CID. */
  readonly value: string;
  /** `protocol://value`. */
  readonly uri: string;
};

/**
 * Encodes a content URI as the bytes stored in an ENS `contenthash` record (ENSIP-7).
 *
 * **Example** (Encoding an IPFS link)
 *
 * ```ts
 * import { ContentHash } from "@ensforge/sdk"
 *
 * ContentHash.encode("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_CONTENT_HASH`) for unsupported schemes or values.
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export const encode = (uri: string): Hex => {
  const match = /^([a-z0-9]+):\/\/(.+)$/.exec(uri);
  const codec =
    match === null ? undefined : (schemes as Readonly<Record<string, Codec>>)[match[1] ?? ""];

  if (match === null || codec === undefined) {
    throw new InvalidInputError({ code: "INVALID_CONTENT_HASH", input: uri });
  }

  try {
    return `0x${encodeContentHash(codec, match[2] ?? "")}`;
  } catch (cause) {
    throw new InvalidInputError({ code: "INVALID_CONTENT_HASH", input: uri, cause });
  }
};

/**
 * Decodes the bytes of an ENS `contenthash` record, or returns `null` when empty.
 *
 * **Example** (Decoding a content hash)
 *
 * ```ts
 * import { ContentHash } from "@ensforge/sdk"
 *
 * const decoded = ContentHash.decode(data)
 * decoded?.uri // "ipfs://…"
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_CONTENT_HASH`) when the bytes are malformed or use
 * an unsupported codec.
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export const decode = (data: Hex): Decoded | null => {
  if (data === "0x") return null;

  try {
    const codec = getCodec(Str.slice(2)(data));
    const protocol = Option.getOrUndefined(
      Arr.findFirst(Rec.keys(schemes), (scheme) => schemes[scheme] === codec),
    );
    if (protocol === undefined) throw new Error(`unsupported codec ${String(codec)}`);

    const value = decodeContentHash(Str.slice(2)(data));
    return { protocol, value, uri: `${protocol}://${value}` };
  } catch (cause) {
    throw new InvalidInputError({ code: "INVALID_CONTENT_HASH", input: data, cause });
  }
};

/**
 * HTTP URL for a content URI through a gateway: `ipfs://` and `ipns://` through `gateways.ipfs`,
 * `ar://` through `gateways.arweave` and `bzz://` through `gateways.swarm`. Unset gateways are the
 * public defaults (`https://ipfs.io`, `https://arweave.net`, `https://api.gateway.ethswarm.org`).
 * URIs without a gateway (`onion://`, `sia://`, anything else) are returned as-is.
 *
 * **Example** (Using the client's gateways)
 *
 * ```ts
 * import { ContentHash } from "@ensforge/sdk"
 *
 * const contentHash = await ens.record.getContentHash({ name: "vitalik.eth" })
 * const url = contentHash && ContentHash.toGatewayUrl(contentHash.uri, ens.config.gateways)
 * ```
 *
 * @stability stable
 * @category records
 * @since 1.0.0
 */
// oxlint-disable-next-line typescript/no-duplicate-type-constituents -- the literal or explicit type argument documents the public type
export const toGatewayUrl = (uri: string, gateways?: Gateways | undefined): string => {
  const match = /^([a-z0-9]+):\/\/(.+)$/.exec(uri);
  if (match === null) return uri;

  const { ipfs, arweave, swarm } = resolveGateways(gateways);
  const prefixes: Readonly<Record<string, string>> = {
    ipfs: `${ipfs}/ipfs/`,
    ipns: `${ipfs}/ipns/`,
    bzz: `${swarm}/bzz/`,
    ar: `${arweave}/`,
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the collection is known to be non-empty or the index in range here; `noUncheckedIndexedAccess` cannot see it
  const scheme = match[1] as Protocol;
  return Rec.has(prefixes, scheme) ? `${prefixes[scheme]}${match[2]}` : uri;
};
