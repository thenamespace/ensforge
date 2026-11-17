import type { Abi, Hex } from "viem";

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
