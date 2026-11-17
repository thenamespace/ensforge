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

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";

/** A non-EVM coin's codec, from `@ensdomains/address-encoder`. */
export type AddressCoder = {
  readonly encode: (data: Uint8Array) => string;
  readonly decode: (address: string) => Uint8Array;
};

const ethCoinType = 60n;
const evmNamespace = 0x8000_0000n;

/** Whether a coin type is an EVM chain (ETH, or ENSIP-11's `0x80000000 | chainId`). */
export const isEvmCoinType = (coinType: bigint): boolean =>
  coinType === ethCoinType || coinType >= evmNamespace;

/**
 * An address as address-record bytes. EVM addresses are 20 raw bytes for any EVM coin type;
 * other coins need their `coder` (`undefined` when none exists).
 */
export const encodeAddressWith = (
  coinType: bigint,
  address: string,
  coder: AddressCoder | undefined,
): Hex => {
  if (isEvmCoinType(coinType)) {
    if (!isAddress(address, { strict: false }))
      throw new InvalidInputError({ code: "INVALID_ADDRESS", input: address });
    return address.toLowerCase() as Hex;
  }

  try {
    if (coder === undefined) throw new Error(`no codec for coin ${coinType}`);
    return bytesToHex(coder.decode(address));
  } catch (cause) {
    throw new InvalidInputError({
      code: "INVALID_ADDRESS",
      input: address,
      field: `coin ${coinType}`,
      cause,
    });
  }
};

/** Address-record bytes as a display address, or `null` when empty or the zero address (EVM). */
export const decodeAddressWith = (
  coinType: bigint,
  data: Hex,
  coder: AddressCoder | undefined,
): string | null => {
  if (data === "0x") return null;

  const malformed = (cause?: unknown) =>
    new InvalidInputError({
      code: "INVALID_ADDRESS",
      input: data,
      field: `coin ${coinType}`,
      cause,
    });

  if (isEvmCoinType(coinType)) {
    if (!isHex(data) || size(data) !== 20) throw malformed();
    // ENSv1 resolvers delete an ETH address by storing the zero address.
    return data === zeroAddress ? null : getAddress(data);
  }
  if (coder === undefined)
    throw new InvalidInputError({ code: "INVALID_COIN_TYPE", input: coinType });

  try {
    return coder.encode(hexToBytes(data));
  } catch (cause) {
    throw malformed(cause);
  }
};
