import type { PublicClient, WalletClient } from "viem";

import type { SharedCreateConfigParameters, EnsforgeConfig } from "../../config/config.js";
import { EnsforgeConfigTypeId } from "../../config/config.js";
import { resolveGatewayOptions } from "../../config/gateway-options.js";
import { resolveIndexerConfig } from "../../config/indexer-options.js";
import { resolveReadOptions } from "../../config/read-options.js";
import { resolveWriteOptions } from "../../config/write-options.js";
import type { EnsforgeServiceValues } from "../services/context.js";
import { makeServicesContext } from "../services/context.js";
import type { WalletClientResolver } from "../services/wallet-client.js";
import { attachConfigContext } from "./context.js";
import { freezeDeployment, resolveNetwork } from "./resolve-network.js";
import { validateClientChain, validateDeployments } from "./validation.js";

interface ConfigClients {
  readonly walletClient?: WalletClient;
  readonly walletClientResolver?: WalletClientResolver;
}

export const createConfigFromClients = (
  parameters: SharedCreateConfigParameters,
  publicClient: PublicClient,
  clients: ConfigClients = {},
): EnsforgeConfig => {
  const { network, chainId, deployments, preset } = resolveNetwork(parameters.network);
  const reads = resolveReadOptions(parameters.reads);
  const writes = resolveWriteOptions(parameters.writes);
  const gateways = resolveGatewayOptions(parameters.gateways);
  const indexer = resolveIndexerConfig(preset, parameters.indexer);

  validateClientChain(publicClient, "public", network, chainId);

  if (clients.walletClient !== undefined) {
    validateClientChain(clients.walletClient, "wallet", network, chainId);
  }

  validateDeployments(deployments, chainId);

  const serviceValues: EnsforgeServiceValues = {
    network,
    chainId,
    publicClient,
    reads,
    gateways,
    deployments,
    ...(clients.walletClient === undefined ? {} : { walletClient: clients.walletClient }),
    ...(clients.walletClientResolver === undefined
      ? {}
      : { walletClientResolver: clients.walletClientResolver }),
  };

  const config = attachConfigContext(
    {
      [EnsforgeConfigTypeId]: EnsforgeConfigTypeId,
      network,
      chainId,
      publicClient,
      reads,
      writes,
      gateways,
      indexer,
      ...(parameters.storage === undefined ? {} : { storage: parameters.storage }),
      deployments,
      ...(parameters.hca === undefined
        ? {}
        : { hca: freezeDeployment(structuredClone(parameters.hca)) }),
      ...(clients.walletClient === undefined ? {} : { walletClient: clients.walletClient }),
    },
    makeServicesContext(serviceValues),
  );

  return Object.freeze(config);
};
