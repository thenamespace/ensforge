import type { Address, Hex } from "viem";

import type { AbiRecord } from "../../../internal/records/abi-record.js";
import type { Decoded as ContentHashDecoded } from "../../../utils/ContentHash.js";

export type { AbiRecord } from "../../../internal/records/abi-record.js";

/**
 * Which records `record.get` reads. Each key adds the matching field to the result.
 *
 * @category records
 * @since 1.0.0
 */
export type Selection = {
  /** Text record keys, e.g. `["url", "avatar", "com.twitter"]`. */
  readonly texts?: readonly string[] | undefined;
  /**
   * Coins by symbol (`"eth"`, `"btc"`, `"base"`) or coin type (`2147492101n`). EVM chains fall back
   * to the default EVM address (ENSIP-19).
   */
  readonly addresses?: readonly (string | bigint)[] | undefined;
  /** Read the content hash (ENSIP-7). */
  readonly contentHash?: true | undefined;
  /** Read the ABI record (ENSIP-4); `contentTypes` is a bitmask of acceptable types. */
  readonly abi?: true | { readonly contentTypes: bigint } | undefined;
  /** Read the SECP256k1 public key. */
  readonly pubkey?: true | undefined;
  /** Read the `name` record (ENSIP-3), used for reverse resolution. */
  readonly nameRecord?: true | undefined;
  /** ERC-165 interface IDs to read implementers for. */
  readonly interfaces?: readonly Hex[] | undefined;
  /** Data record keys (ENSIP-24). */
  readonly data?: readonly string[] | undefined;
};

type AddressKey<coin> = coin extends string ? coin : coin extends bigint ? `${coin}` : never;
type AddressValue<coin> = coin extends "eth" | 60n ? Address | null : string | null;

/**
 * Result of `record.get`, narrowed to the selection: only selected fields exist.
 *
 * @category records
 * @since 1.0.0
 */
export type Records<selection extends Selection = Selection> = {
  /** Resolver that answered, or `null` when the name has none. */
  readonly resolver: Address | null;
} & (selection extends { readonly texts: readonly (infer key extends string)[] }
  ? { readonly texts: { readonly [k in key]: string | null } }
  : {}) &
  (selection extends { readonly addresses: readonly (infer coin)[] }
    ? { readonly addresses: { readonly [c in coin as AddressKey<c>]: AddressValue<c> } }
    : {}) &
  (selection extends { readonly contentHash: true }
    ? { readonly contentHash: ContentHashDecoded | null }
    : {}) &
  (selection extends { readonly abi: true | { readonly contentTypes: bigint } }
    ? { readonly abi: AbiRecord | null }
    : {}) &
  (selection extends { readonly pubkey: true }
    ? { readonly pubkey: { readonly x: Hex; readonly y: Hex } | null }
    : {}) &
  (selection extends { readonly nameRecord: true } ? { readonly nameRecord: string | null } : {}) &
  (selection extends { readonly interfaces: readonly (infer id extends Hex)[] }
    ? { readonly interfaces: { readonly [i in id]: Address | null } }
    : {}) &
  (selection extends { readonly data: readonly (infer key extends string)[] }
    ? { readonly data: { readonly [k in key]: Hex | null } }
    : {});
