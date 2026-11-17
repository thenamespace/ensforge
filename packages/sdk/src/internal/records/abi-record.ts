import { decode as decodeCbor } from "cborg";
import { strFromU8, unzlibSync } from "fflate";
import { bytesToString, hexToBytes, stringToHex, type Abi, type Hex } from "viem";

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

const decodeAbi = (contentType: bigint, bytes: Uint8Array): Pick<AbiRecord, "abi" | "uri"> => {
  switch (contentType) {
    case 1n:
      return { abi: JSON.parse(bytesToString(bytes)) as Abi, uri: null };
    case 2n:
      return { abi: JSON.parse(strFromU8(unzlibSync(bytes))) as Abi, uri: null };
    case 4n:
      return { abi: decodeCbor(bytes) as Abi, uri: null };
    case 8n:
      return { abi: null, uri: bytesToString(bytes) };
    default:
      return { abi: null, uri: null };
  }
};

/** Decodes an ABI record; an undecodable payload keeps its raw bytes with `abi` and `uri` null. */
export const decodeAbiRecord = (contentType: bigint, data: Hex): AbiRecord | null => {
  if (contentType === 0n || data === "0x") return null;

  try {
    return { contentType, data, ...decodeAbi(contentType, hexToBytes(data)) };
  } catch {
    return { contentType, data, abi: null, uri: null };
  }
};

/** Encodes an ABI as a JSON (content type 1) record payload. */
export const encodeAbiJson = (abi: Abi): Hex => stringToHex(JSON.stringify(abi));
