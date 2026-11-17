import { Effect } from "effect";

import type { PublicClient } from "viem";
import type { Config as WagmiConfig } from "wagmi";
import { getPublicClient, getWalletClient } from "wagmi/actions";

import type { EnsNetworkId } from "../../config/network.js";
import { ConfigError } from "../../errors/config-error.js";
import type { WalletClientResolver } from "../services/wallet-client.js";

export const getWagmiPublicClient = (
  wagmiConfig: WagmiConfig,
  network: EnsNetworkId,
  chainId: number,
): PublicClient => {
  const publicClient = getPublicClient(wagmiConfig, { chainId });

  if (publicClient === undefined) {
    throw new ConfigError({
      code: "PUBLIC_CLIENT_UNAVAILABLE",
      message: `The Wagmi config does not provide a public client for ${network} (${chainId})`,
    });
  }

  return publicClient;
};

export const makeWagmiWalletClientResolver = (
  wagmiConfig: WagmiConfig,
  network: EnsNetworkId,
  chainId: number,
): WalletClientResolver =>
  Effect.fn("ensforge.resolveWagmiWalletClient")(function* () {
    return yield* Effect.tryPromise({
      try: () => getWalletClient(wagmiConfig, { chainId }),
      catch: () =>
        new ConfigError({
          code: "WALLET_CLIENT_UNAVAILABLE",
          message: `The Wagmi config does not have a connected wallet for ${network} (${chainId})`,
        }),
    });
  });
