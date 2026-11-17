import type { EnsforgeConfig } from "../config/config.js";
import { createConfigFromClients } from "../internal/config/create-config.js";
import { resolveNetwork } from "../internal/config/resolve-network.js";
import {
  getWagmiPublicClient,
  makeWagmiWalletClientResolver,
} from "../internal/config/wagmi-clients.js";
import type { CreateWagmiConfigParameters } from "./config.js";

export const createWagmiConfig = (parameters: CreateWagmiConfigParameters): EnsforgeConfig => {
  const { network, chainId } = resolveNetwork(parameters.network);
  const publicClient = getWagmiPublicClient(parameters.wagmiConfig, network, chainId);

  return createConfigFromClients(parameters, publicClient, {
    walletClientResolver: makeWagmiWalletClientResolver(parameters.wagmiConfig, network, chainId),
  });
};
