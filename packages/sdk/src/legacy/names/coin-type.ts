import { Schema } from "effect";

import { toCoinType as viemToCoinType } from "viem/ens";

import { CodecError } from "../errors/codec-error.js";
import { CoinType, type CoinType as CoinTypeValue } from "../schemas/coin-type.js";

const EVM_COIN_TYPE_NAMESPACE = 0x8000_0000n;

const EvmChainId = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThan(0x8000_0000)),
);

export type CoinTypeNamespace =
  | {
      readonly namespace: "evm";
      readonly chainId: number;
    }
  | {
      readonly namespace: "slip44";
      readonly coinType: CoinTypeValue;
    };

export const parseCoinType = (coinType: bigint): CoinTypeValue => {
  try {
    return Schema.decodeSync(CoinType)(coinType);
  } catch {
    throw new CodecError({
      code: "INVALID_COIN_TYPE",
      message: `Invalid ENS coin type: ${coinType}`,
    });
  }
};

export const toCoinType = (chainId: number): CoinTypeValue => {
  if (!Schema.is(EvmChainId)(chainId)) {
    throw new CodecError({
      code: "INVALID_CHAIN_ID",
      message: `Invalid EVM chain ID: ${chainId}`,
    });
  }

  try {
    return parseCoinType(viemToCoinType(chainId));
  } catch (error) {
    if (error instanceof CodecError) throw error;

    throw new CodecError({
      code: "INVALID_CHAIN_ID",
      message: `Invalid EVM chain ID: ${chainId}`,
    });
  }
};

export const fromCoinType = (coinType: bigint | CoinTypeValue): CoinTypeNamespace => {
  const decodedCoinType = parseCoinType(coinType);

  if (decodedCoinType === 60n) {
    return Object.freeze({ namespace: "evm", chainId: 1 });
  }

  if (decodedCoinType >= EVM_COIN_TYPE_NAMESPACE) {
    return Object.freeze({
      namespace: "evm",
      chainId: Number(decodedCoinType - EVM_COIN_TYPE_NAMESPACE),
    });
  }

  return Object.freeze({ namespace: "slip44", coinType: decodedCoinType });
};
