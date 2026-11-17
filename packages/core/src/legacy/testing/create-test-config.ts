import type { HcaDeploymentProfile } from "@ensforge/contracts/internal";
import type { PublicClient, WalletClient } from "viem";

import type { EnsDeploymentProfile, EnsforgeConfig } from "../config/config.js";
import { EnsforgeConfigTypeId } from "../config/config.js";
import type { GatewayOptions } from "../config/gateway-options.js";
import { resolveGatewayOptions } from "../config/gateway-options.js";
import type { ReadOptions } from "../config/read-options.js";
import { resolveReadOptions } from "../config/read-options.js";
import type { WriteOptions } from "../config/write-options.js";
import { resolveWriteOptions } from "../config/write-options.js";
import { attachConfigContext } from "../internal/config/context.js";
import { freezeDeployment } from "../internal/config/resolve-network.js";
import { validateClientChain, validateDeployments } from "../internal/config/validation.js";
import { makeServicesContext } from "../internal/services/context.js";
import type { WorkflowStorage } from "../workflows/storage.js";

export const ensTestChainId = 31337 as const;

export interface CreateTestConfigParameters {
  readonly storage?: WorkflowStorage;
  readonly hca?: HcaDeploymentProfile;
  readonly deployments: EnsDeploymentProfile;
  readonly publicClient: PublicClient;
  readonly walletClient?: WalletClient;
  readonly reads?: ReadOptions;
  readonly writes?: WriteOptions;
  readonly gateways?: GatewayOptions;
}

export const createTestConfig = (parameters: CreateTestConfigParameters): EnsforgeConfig => {
  validateClientChain(parameters.publicClient, "public", "devnet", ensTestChainId);

  if (parameters.walletClient !== undefined) {
    validateClientChain(parameters.walletClient, "wallet", "devnet", ensTestChainId);
  }

  validateDeployments(parameters.deployments, ensTestChainId);

  const reads = resolveReadOptions(parameters.reads);
  const writes = resolveWriteOptions(parameters.writes);
  const gateways = resolveGatewayOptions(parameters.gateways);

  const serviceValues = {
    network: "devnet",
    chainId: ensTestChainId,
    publicClient: parameters.publicClient,
    reads,
    gateways,
    deployments: parameters.deployments,
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
  } as const;

  return Object.freeze(
    attachConfigContext(
      {
        [EnsforgeConfigTypeId]: EnsforgeConfigTypeId,
        ...serviceValues,
        ...(parameters.hca === undefined
          ? {}
          : { hca: freezeDeployment(structuredClone(parameters.hca)) }),
        ...(parameters.storage === undefined ? {} : { storage: parameters.storage }),
        writes,
        gateways,
      } as unknown as EnsforgeConfig,
      makeServicesContext(serviceValues),
    ),
  );
};
