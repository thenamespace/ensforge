import { type Effect, String as Str } from "effect";

import { Deployments } from "@ensforge/contracts";
import type { Address } from "viem";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import * as CoinType from "../../utils/CoinType.js";
import { tryAny } from "../anyError.js";
import { defaultEvmCoinType } from "../records/read-profiles.js";

/** Ethereum mainnet's coin type, whose reverse names live under `addr.reverse`. */
export const ethCoinType = 60n;

/**
 * The EVM coin type of a primary-name coin: any EVM coin, or `"default"` for every EVM chain
 * (ENSIP-19). Non-EVM coins have no address-keyed reverse name. The chain ENS runs on is
 * Ethereum's coin for primary names (`addr.reverse`), on a testnet too.
 */
export const primaryNameCoinType = (
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- the literal or explicit type argument documents the public type
  coin: CoinType.Input | "default" | undefined,
  ensChainId?: number,
): Effect.Effect<bigint, AnyError> =>
  tryAny(() => {
    const coinType =
      coin === undefined
        ? ethCoinType
        : coin === "default"
          ? defaultEvmCoinType
          : CoinType.from(coin);
    if (
      ensChainId !== undefined &&
      ensChainId !== 1 &&
      coinType === CoinType.fromChainId(ensChainId)
    ) {
      return ethCoinType;
    }
    if (!CoinType.isEvm(coinType)) {
      throw new InvalidInputError({
        code: "INVALID_COIN_TYPE",
        input: coin,
        hint: 'Primary names exist for EVM chains: `eth`, `{ chainId }` or `"default"`.',
      });
    }
    return coinType;
  });

/** ENSIP-19 reverse name of an address for an EVM coin type. */
export const reverseName = (address: Address, coinType: bigint): string => {
  const label = Str.toLowerCase(Str.slice(2)(address));
  if (coinType === ethCoinType) return `${label}.addr.reverse`;
  if (coinType === defaultEvmCoinType) return `${label}.default.reverse`;
  return `${label}.${coinType.toString(16)}.reverse`;
};

/**
 * The L2 reverse registrars a client on `ensChainId` names through: mainnet L2s through Ethereum
 * mainnet, testnet L2s through Sepolia. A devnet's local L1 reaches either, as its tests do.
 */
export const l2RegistrarsOf = (ensChainId: number): Readonly<Record<number, Address>> =>
  ensChainId === 1
    ? Deployments.mainnetL2ReverseRegistrars
    : ensChainId === 11155111
      ? Deployments.testnetL2ReverseRegistrars
      : Deployments.l2ReverseRegistrars;
