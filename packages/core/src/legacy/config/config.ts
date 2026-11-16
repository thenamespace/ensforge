import type { HcaDeploymentProfile } from "@ensforge/contracts/internal";
import type { PublicClient, WalletClient } from "viem";

import type { EnsProtocol } from "../schemas/protocol.js";
import type { WorkflowStorage } from "../workflows/storage.js";
import type {
  CustomEnsNetwork,
  EnsV1ConfigDeployment,
  EnsV2ConfigDeployment,
} from "./custom-network.js";
import type { GatewayOptions, ResolvedGatewayOptions } from "./gateway-options.js";
import type { IndexerConfig, ResolvedIndexerConfig } from "./indexer-options.js";
import type { EnsNetwork, EnsNetworkId } from "./network.js";
import type { ReadOptions, ResolvedReadOptions } from "./read-options.js";
import type { ResolvedWriteOptions, WriteOptions } from "./write-options.js";

export const EnsforgeConfigTypeId: unique symbol = Symbol.for("@ensforge/core/EnsforgeConfig");

export type EnsDeployment = EnsV1ConfigDeployment | EnsV2ConfigDeployment;

export type EnsDeploymentProfile =
  | {
      readonly protocol: Extract<EnsProtocol, "v1">;
      readonly v1: EnsV1ConfigDeployment;
      readonly v2?: never;
    }
  | {
      readonly protocol: Extract<EnsProtocol, "v2">;
      readonly v1?: EnsV1ConfigDeployment;
      readonly v2: EnsV2ConfigDeployment;
    };

export interface SharedCreateConfigParameters {
  readonly storage?: WorkflowStorage;
  readonly hca?: HcaDeploymentProfile;
  readonly network: EnsNetwork | CustomEnsNetwork;
  readonly reads?: ReadOptions;
  readonly writes?: WriteOptions;
  readonly gateways?: GatewayOptions;
  readonly indexer?: IndexerConfig | false;
}

export interface CreateViemConfigParameters extends SharedCreateConfigParameters {
  readonly publicClient: PublicClient;
  readonly walletClient?: WalletClient;
}

export type CreateConfigParameters = CreateViemConfigParameters;

export type EnsRuntimeNetwork = EnsNetworkId;

export type EnsRuntimeChainId = number;

/** Immutable, single-network configuration consumed by every ensforge action. */
export interface EnsforgeConfig {
  readonly storage?: WorkflowStorage;
  readonly hca?: HcaDeploymentProfile;
  readonly [EnsforgeConfigTypeId]: typeof EnsforgeConfigTypeId;
  readonly network: EnsNetworkId;
  readonly chainId: number;
  readonly publicClient: PublicClient;
  readonly walletClient?: WalletClient;
  readonly reads: ResolvedReadOptions;
  readonly writes: ResolvedWriteOptions;
  readonly gateways: ResolvedGatewayOptions;
  readonly indexer: ResolvedIndexerConfig;
  readonly deployments: EnsDeploymentProfile;
}
