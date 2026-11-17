import { Effect } from "effect";

import type { Address } from "viem";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import * as CoinType from "../../utils/CoinType.js";
import { defaultEvmCoinType } from "../records/read-profiles.js";

/** Ethereum mainnet's coin type, whose reverse names live under `addr.reverse`. */
export const ethCoinType = 60n;

/**
 * The EVM coin type of a primary-name coin: any EVM coin, or `"default"` for every EVM chain
 * (ENSIP-19). Non-EVM coins have no address-keyed reverse name.
 */
export const primaryNameCoinType = (
  coin: CoinType.Input | "default" | undefined,
): Effect.Effect<bigint, AnyError> =>
  Effect.try({
    try: () => {
      const coinType =
        coin === undefined
          ? ethCoinType
          : coin === "default"
            ? defaultEvmCoinType
            : CoinType.from(coin);
      if (!CoinType.isEvm(coinType)) {
        throw new InvalidInputError({
          code: "INVALID_COIN_TYPE",
          input: coin,
          hint: 'Primary names exist for EVM chains: `eth`, `{ chainId }` or `"default"`.',
        });
      }
      return coinType;
    },
    catch: (error) => error as AnyError,
  });

/** ENSIP-19 reverse name of an address for an EVM coin type. */
export const reverseName = (address: Address, coinType: bigint): string => {
  const label = address.slice(2).toLowerCase();
  if (coinType === ethCoinType) return `${label}.addr.reverse`;
  if (coinType === defaultEvmCoinType) return `${label}.default.reverse`;
  return `${label}.${coinType.toString(16)}.reverse`;
};
