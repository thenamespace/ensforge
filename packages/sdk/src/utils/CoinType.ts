import {
  coinNameToTypeMap,
  coinTypeToNameMap,
  getCoderByCoinType,
} from "@ensdomains/address-encoder";
import {
  bytesToHex,
  getAddress,
  hexToBytes,
  isAddress,
  isHex,
  size,
  zeroAddress,
  type Hex,
} from "viem";

import { InvalidInputError } from "../errors/classes/InvalidInputError.js";

/** ETH on Ethereum mainnet (SLIP-44). */
const ethCoinType = 60n;
/** ENSIP-11: EVM chains use `0x80000000 | chainId`. */
const evmNamespace = 0x8000_0000n;

const invalid = (input: unknown, cause?: unknown) =>
  new InvalidInputError({ code: "INVALID_COIN_TYPE", input, cause });

/**
 * What identifies a coin: a symbol (`"btc"`), an EVM chain (`{ chainId: 8453 }`) or a numeric
 * coin type.
 *
 * @category records
 * @since 1.0.0
 */
export type Input = string | bigint | { readonly chainId: number };

/**
 * ENSIP-11 coin type of an EVM chain. Ethereum mainnet is `60`.
 *
 * @throws `Errors.InvalidInputError` (`INVALID_COIN_TYPE`) when `chainId` is not a valid chain ID.
 * @category records
 * @since 1.0.0
 */
export const fromChainId = (chainId: number): bigint => {
  if (!Number.isSafeInteger(chainId) || chainId < 0 || BigInt(chainId) >= evmNamespace) {
    throw invalid(chainId);
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
 * @category records
 * @since 1.0.0
 */
export const from = (input: Input): bigint => {
  if (typeof input === "bigint") {
    if (input < 0n) throw invalid(input);
    return input;
  }
  if (typeof input === "object") return fromChainId(input.chainId);

  const coinType = (coinNameToTypeMap as Readonly<Record<string, number>>)[input.toLowerCase()];
  if (coinType === undefined) throw invalid(input);
  return BigInt(coinType);
};

/**
 * Whether a coin type is an EVM chain (Ethereum mainnet or ENSIP-11).
 *
 * @category records
 * @since 1.0.0
 */
export const isEvm = (coinType: bigint): boolean =>
  coinType === ethCoinType || coinType >= evmNamespace;

/**
 * EVM chain ID of a coin type, or `null` for non-EVM coins.
 *
 * @category records
 * @since 1.0.0
 */
export const toChainId = (coinType: bigint): number | null => {
  if (coinType === ethCoinType) return 1;
  if (coinType >= evmNamespace) return Number(coinType - evmNamespace);
  return null;
};

/**
 * Symbol of a coin type, such as `btc`, or `null` when unknown.
 *
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
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) when the address is invalid for the coin.
 * @category records
 * @since 1.0.0
 */
export const encodeAddress = (coinType: bigint, address: string): Hex => {
  if (isEvm(coinType)) {
    if (!isAddress(address, { strict: false }))
      throw new InvalidInputError({ code: "INVALID_ADDRESS", input: address });
    return address.toLowerCase() as Hex;
  }

  try {
    return bytesToHex(getCoderByCoinType(Number(coinType)).decode(address));
  } catch (cause) {
    throw new InvalidInputError({
      code: "INVALID_ADDRESS",
      input: address,
      field: `coin ${coinType}`,
      cause,
    });
  }
};

/**
 * Decodes the bytes of an ENS address record into a display address, or `null` when empty (or the
 * zero address, for EVM coins).
 *
 * @throws `Errors.InvalidInputError` (`INVALID_COIN_TYPE`) when no codec exists for the coin.
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) when the bytes are not an address of the
 * coin.
 * @category records
 * @since 1.0.0
 */
export const decodeAddress = (coinType: bigint, data: Hex): string | null => {
  if (data === "0x") return null;

  const malformed = (cause?: unknown) =>
    new InvalidInputError({
      code: "INVALID_ADDRESS",
      input: data,
      field: `coin ${coinType}`,
      cause,
    });

  if (isEvm(coinType)) {
    if (!isHex(data) || size(data) !== 20) throw malformed();
    // ENSv1 resolvers delete an ETH address by storing the zero address.
    return data === zeroAddress ? null : getAddress(data);
  }

  let coder: ReturnType<typeof getCoderByCoinType>;
  try {
    coder = getCoderByCoinType(Number(coinType));
  } catch (cause) {
    throw invalid(coinType, cause);
  }

  try {
    return coder.encode(hexToBytes(data));
  } catch (cause) {
    throw malformed(cause);
  }
};
