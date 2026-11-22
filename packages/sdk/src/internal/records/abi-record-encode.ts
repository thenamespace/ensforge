/* oxlint-disable effecttsgo/global-json -- an ABI record holds a JSON ABI; Effect's Schema would load with every ABI write */

// Encoding compressed or CBOR ABI records needs zlib and CBOR; this module is loaded only when a
// write asks for one.
import { encode as encodeCbor } from "cborg";
import { strToU8, zlibSync } from "fflate";
import { bytesToHex, type Abi, type Hex } from "viem";

/** The bytes of an ABI record in a compressed (2) or CBOR (4) content type. */
export const encodeAbiRecord = (contentType: bigint, abi: Abi): Hex =>
  bytesToHex(contentType === 2n ? zlibSync(strToU8(JSON.stringify(abi))) : encodeCbor(abi));
