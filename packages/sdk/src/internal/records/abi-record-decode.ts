/* oxlint-disable effecttsgo/global-json, typescript/no-unsafe-type-assertion -- ABI records are JSON or CBOR of untyped shape, and a malformed payload is caught by `decodeAbiRecord`; Effect's Schema would load with every ABI read */

// Decoding ABI records needs CBOR and zlib; this module is loaded only when a read asks for an ABI.
import { decode as decodeCbor } from "cborg";
import { strFromU8, unzlibSync } from "fflate";
import { bytesToString, hexToBytes, type Abi, type Hex } from "viem";

import type { AbiRecord } from "./abi-record.js";

const decodeAbi = (contentType: bigint, bytes: Uint8Array): Pick<AbiRecord, "abi" | "uri"> => {
  switch (contentType) {
    case 1n:
      return { abi: JSON.parse(bytesToString(bytes)) as Abi, uri: null };
    case 2n:
      return { abi: JSON.parse(strFromU8(unzlibSync(bytes))) as Abi, uri: null };
    case 4n:
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an ABI record holds a JSON ABI; a malformed payload is handled by the caller
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
