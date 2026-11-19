import { String as Str } from "effect";

import {
  coinNameToTypeMap,
  coinTypeToNameMap,
  getCoderByCoinType,
} from "@ensdomains/address-encoder";
import type { Hex } from "viem";

import { InvalidInputError } from "../errors/classes/InvalidInputError.js";
import {
  decodeAddressWith,
  encodeAddressWith,
  isEvmCoinType,
  type AddressCoder,
} from "../internal/records/address-codec.js";

/** ETH on Ethereum mainnet (SLIP-44). */
const ethCoinType = 60n;
/** ENSIP-11: EVM chains use `0x80000000 | chainId`. */
const evmNamespace = 0x8000_0000n;

// Every coin's codec, synchronously: apps that only read or write records through actions load
// codecs lazily instead (internal/records/codecs.ts).
const coderOf = (coinType: bigint): AddressCoder | undefined => {
  if (isEvmCoinType(coinType)) return undefined;
  try {
    return getCoderByCoinType(Number(coinType)) as AddressCoder;
  } catch {
    return undefined;
  }
};

/**
 * What identifies a coin: a symbol (`"btc"`), an EVM chain (`{ chainId: 8453 }`) or a numeric
 * coin type.
 *
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export type Input = string | bigint | { readonly chainId: number };

/**
 * ENSIP-11 coin type of an EVM chain. Ethereum mainnet is `60`.
 *
 * **Example** (Coin type of a chain)
 *
 * ```ts
 * import { CoinType } from "@ensforge/sdk"
 *
 * CoinType.fromChainId(8453) // 2147492101n (Base)
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_COIN_TYPE`) when `chainId` is not a valid chain ID.
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export const fromChainId = (chainId: number): bigint => {
  if (!Number.isSafeInteger(chainId) || chainId < 0 || BigInt(chainId) >= evmNamespace) {
    throw new InvalidInputError({ code: "INVALID_COIN_TYPE", input: chainId });
  }
  return chainId === 1 ? ethCoinType : evmNamespace | BigInt(chainId);
};

/**
 * Resolves any coin input to its numeric coin type.
 *
 * **Example** (Coin types)
 *
 * ```ts
 * import { CoinType } from "@ensforge/sdk"
 *
 * CoinType.from("btc")             // 0n
 * CoinType.from({ chainId: 8453 }) // 2147492101n (Base)
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_COIN_TYPE`) for unknown symbols or negative values.
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export const from = (input: Input): bigint => {
  if (typeof input === "bigint") {
    if (input < 0n) throw new InvalidInputError({ code: "INVALID_COIN_TYPE", input });
    return input;
  }
  if (typeof input === "object") return fromChainId(input.chainId);

  // Symbols are lowercase except the legacy SLIP-44 EVM coins (`etcLegacy`), so the exact
  // spelling is tried first.
  const coinTypes = coinNameToTypeMap as Readonly<Record<string, number>>;
  const coinType = coinTypes[input] ?? coinTypes[Str.toLowerCase(input)];
  if (coinType === undefined) throw new InvalidInputError({ code: "INVALID_COIN_TYPE", input });
  return BigInt(coinType);
};

/**
 * Whether a coin type is an EVM chain (Ethereum mainnet or ENSIP-11).
 *
 * **Example** (Telling EVM coins apart)
 *
 * ```ts
 * import { CoinType } from "@ensforge/sdk"
 *
 * CoinType.isEvm(CoinType.from("eth")) // true
 * CoinType.isEvm(CoinType.from("btc")) // false
 * ```
 *
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export const isEvm = (coinType: bigint): boolean => isEvmCoinType(coinType);

/**
 * EVM chain ID of a coin type, or `null` for non-EVM coins.
 *
 * **Example** (Recovering a chain ID)
 *
 * ```ts
 * import { CoinType } from "@ensforge/sdk"
 *
 * CoinType.toChainId(2147492101n) // 8453
 * ```
 *
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export const toChainId = (coinType: bigint): number | null => {
  if (coinType === ethCoinType) return 1;
  if (isEvmCoinType(coinType)) return Number(coinType - evmNamespace);
  return null;
};

/**
 * Symbol of a coin type, such as `btc`, or `null` when unknown.
 *
 * **Example** (Naming a coin type)
 *
 * ```ts
 * import { CoinType } from "@ensforge/sdk"
 *
 * CoinType.toSymbol(0n) // "btc"
 * ```
 *
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export const toSymbol = (coinType: bigint): string | null =>
  (coinTypeToNameMap as Readonly<Record<string, readonly [string, string] | undefined>>)[
    String(coinType)
  ]?.[0] ?? null;

/**
 * Encodes an address as the bytes stored in an ENS address record.
 *
 * **Details**
 *
 * EVM addresses are stored as 20 raw bytes for any EVM coin type, including chains the codec
 * library does not list. Other coins use `@ensdomains/address-encoder`.
 *
 * **Example** (Encoding an address record)
 *
 * ```ts
 * import { CoinType } from "@ensforge/sdk"
 *
 * const bytes = CoinType.encodeAddress(CoinType.from("eth"), address)
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) when the address is invalid for the coin.
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export const encodeAddress = (coinType: bigint, address: string): Hex =>
  encodeAddressWith(coinType, address, coderOf(coinType));

/**
 * Decodes the bytes of an ENS address record into a display address, or `null` when empty (or the
 * zero address, for EVM coins).
 *
 * **Example** (Decoding an address record)
 *
 * ```ts
 * import { CoinType } from "@ensforge/sdk"
 *
 * const shown = CoinType.decodeAddress(CoinType.from("eth"), data)
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_COIN_TYPE`) when no codec exists for the coin.
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) when the bytes are not an address of the
 * coin.
 * @stability stable
 * @category records
 * @since 1.0.0
 */
export const decodeAddress = (coinType: bigint, data: Hex): string | null =>
  decodeAddressWith(coinType, data, coderOf(coinType));
