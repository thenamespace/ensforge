import { stringToHex, type Abi, type Hex } from "viem";

/**
 * ABI record content types (ENSIP-4): 1 JSON, 2 zlib-compressed JSON, 4 CBOR, 8 URI.
 *
 * @category records
 * @since 1.0.0
 */
export type AbiContentType = 1n | 2n | 4n | 8n;

/**
 * A decoded ABI record.
 *
 * @category records
 * @since 1.0.0
 */
export type AbiRecord = {
  readonly contentType: bigint;
  /** The ABI, for JSON, zlib and CBOR records. */
  readonly abi: Abi | null;
  /** The URI, for content type 8. */
  readonly uri: string | null;
  /** Raw record bytes. */
  readonly data: Hex;
};

/** Every content type, the default `contentTypes` mask for reads. */
export const allAbiContentTypes = 1n | 2n | 4n | 8n;

/** Encodes an ABI as a JSON (content type 1) record payload. */
export const encodeAbiJson = (abi: Abi): Hex => stringToHex(JSON.stringify(abi));
