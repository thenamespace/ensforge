import { Schema } from "effect";

import { getCoderByCoinType } from "@ensdomains/address-encoder";
import { bytesToHex, hexToBytes } from "viem";

import { CodecError } from "../errors/codec-error.js";
import type { CoinType as CoinTypeValue } from "../schemas/coin-type.js";
import {
  AddressRecordData,
  type AddressRecordData as AddressRecordDataValue,
} from "../schemas/records.js";
import { fromCoinType } from "./coin-type.js";

export interface EncodeAddressRecordParameters {
  readonly coinType: bigint | CoinTypeValue;
  readonly address: string;
}

export interface DecodeAddressRecordParameters {
  readonly coinType: bigint | CoinTypeValue;
  readonly data: `0x${string}` | AddressRecordDataValue;
}

const getAddressCoder = (coinType: bigint | CoinTypeValue) => {
  const decodedCoinType = fromCoinType(coinType);

  const numericCoinType =
    decodedCoinType.namespace === "slip44"
      ? Number(decodedCoinType.coinType)
      : decodedCoinType.chainId === 1
        ? 60
        : Number(0x8000_0000n + BigInt(decodedCoinType.chainId));

  try {
    return getCoderByCoinType(numericCoinType);
  } catch {
    throw new CodecError({
      code: "UNSUPPORTED_COIN_TYPE",
      message: `No address codec is available for coin type ${coinType}`,
    });
  }
};

export const encodeAddressRecord = ({
  address,
  coinType,
}: EncodeAddressRecordParameters): AddressRecordDataValue => {
  const coder = getAddressCoder(coinType);

  try {
    return Schema.decodeSync(AddressRecordData)(bytesToHex(coder.decode(address)));
  } catch {
    throw new CodecError({
      code: "INVALID_ADDRESS_RECORD",
      message: `Invalid address for coin type ${coinType}`,
    });
  }
};

export const decodeAddressRecord = ({
  coinType,
  data,
}: DecodeAddressRecordParameters): string | null => {
  let encodedAddress: AddressRecordDataValue;

  try {
    encodedAddress = Schema.decodeSync(AddressRecordData)(data);
  } catch {
    throw new CodecError({
      code: "INVALID_ADDRESS_RECORD",
      message: `Invalid encoded address for coin type ${coinType}`,
    });
  }

  fromCoinType(coinType);

  if (encodedAddress.length === 2) return null;

  try {
    return getAddressCoder(coinType).encode(hexToBytes(encodedAddress));
  } catch (error) {
    if (error instanceof CodecError) throw error;

    throw new CodecError({
      code: "INVALID_ADDRESS_RECORD",
      message: `Invalid encoded address for coin type ${coinType}`,
    });
  }
};
