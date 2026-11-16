import {
  decode as decodeContentHash,
  encode as encodeContentHash,
  getCodec,
  type Codec,
} from "@ensdomains/content-hash";
import type { Hex } from "viem";

import { InvalidInputError } from "../errors/classes/InvalidInputError.js";

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
 * @category records
 * @since 1.0.0
 */
export type Protocol = keyof typeof schemes;

/**
 * A decoded content hash.
 *
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

const protocolOf = (codec: Codec): Protocol | undefined =>
  (Object.keys(schemes) as Protocol[]).find((protocol) => schemes[protocol] === codec);

/**
 * Encodes a content URI as the bytes stored in an ENS `contenthash` record (ENSIP-7).
 *
 * **Example** (Encoding an IPFS link)
 *
 * ```ts
 * import { ContentHash } from "@ensforge/core"
 *
 * ContentHash.encode("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_CONTENT_HASH`) for unsupported schemes or values.
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
 * @throws `Errors.InvalidInputError` (`INVALID_CONTENT_HASH`) when the bytes are malformed or use
 * an unsupported codec.
 * @category records
 * @since 1.0.0
 */
export const decode = (data: Hex): Decoded | null => {
  if (data === "0x") return null;

  try {
    const codec = getCodec(data.slice(2));
    const protocol = codec === undefined ? undefined : protocolOf(codec);
    if (protocol === undefined) throw new Error(`unsupported codec ${String(codec)}`);

    const value = decodeContentHash(data.slice(2));
    return { protocol, value, uri: `${protocol}://${value}` };
  } catch (cause) {
    throw new InvalidInputError({ code: "INVALID_CONTENT_HASH", input: data, cause });
  }
};

/** Default public HTTP gateways per protocol. */
const defaultGateways: Readonly<Partial<Record<Protocol, string>>> = {
  ipfs: "https://ipfs.io/ipfs/",
  ipns: "https://ipfs.io/ipns/",
  bzz: "https://api.gateway.ethswarm.org/bzz/",
  ar: "https://arweave.net/",
};

/**
 * HTTP URL for a content URI through a public gateway. URIs without a gateway are returned as-is.
 *
 * @category records
 * @since 1.0.0
 */
export const toGatewayUrl = (
  uri: string,
  gateways: Readonly<Partial<Record<Protocol, string>>> = {},
): string => {
  const match = /^([a-z0-9]+):\/\/(.+)$/.exec(uri);
  const protocol = match?.[1] as Protocol | undefined;
  const gateway =
    protocol === undefined ? undefined : (gateways[protocol] ?? defaultGateways[protocol]);

  return gateway === undefined || match === null ? uri : `${gateway}${match[2]}`;
};
