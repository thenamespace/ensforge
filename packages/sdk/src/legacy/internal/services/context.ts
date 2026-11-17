import { Context, Layer, Semaphore } from "effect";

import type { PublicClient, WalletClient } from "viem";

import type {
  EnsDeploymentProfile,
  EnsRuntimeChainId,
  EnsRuntimeNetwork,
} from "../../config/config.js";
import type { ResolvedGatewayOptions } from "../../config/gateway-options.js";
import type { ResolvedReadOptions } from "../../config/read-options.js";
import { EthereumClient, makeEthereumClient } from "../client/ethereum-client.js";
import { withGatewayPolicy } from "../gateway/ccip-request.js";
import { ReadExecution, makeReadExecution } from "../read/execution-context.js";
import { WriteClient, makeWriteClient } from "../write/write-client.js";
import { DeploymentService } from "./deployment.js";
import { EnsNetworkService } from "./network.js";
import { PublicClientService } from "./public-client.js";
import {
  makeWalletClientService,
  WalletClientService,
  type WalletClientResolver,
} from "./wallet-client.js";

export type EnsforgeServices =
  | DeploymentService
  | EthereumClient
  | ReadExecution
  | WriteClient
  | EnsNetworkService
  | PublicClientService
  | WalletClientService;

export interface EnsforgeServiceValues {
  readonly network: EnsRuntimeNetwork;
  readonly chainId: EnsRuntimeChainId;
  readonly publicClient: PublicClient;
  readonly reads: ResolvedReadOptions;
  readonly gateways: ResolvedGatewayOptions;
  readonly walletClient?: WalletClient;
  readonly walletClientResolver?: WalletClientResolver;
  readonly deployments: EnsDeploymentProfile;
}

export const makeServicesContext = (
  values: EnsforgeServiceValues,
): Context.Context<EnsforgeServices> => {
  const readSemaphore = Semaphore.makeUnsafe(values.reads.concurrency);
  const ccipClient = withGatewayPolicy(values.publicClient, values.gateways);

  return Context.make(EnsNetworkService, {
    network: values.network,
    chainId: values.chainId,
  }).pipe(
    Context.add(PublicClientService, { client: values.publicClient }),
    Context.add(EthereumClient, makeEthereumClient({ publicClient: ccipClient, readSemaphore })),
    Context.add(
      ReadExecution,
      makeReadExecution({
        publicClient: values.publicClient,
        readSemaphore,
        multicallBatchSize: values.reads.multicallBatchSize,
      }),
    ),
    Context.add(WriteClient, makeWriteClient(values.publicClient, readSemaphore)),
    Context.add(
      WalletClientService,
      makeWalletClientService(values.walletClient, values.walletClientResolver),
    ),
    Context.add(DeploymentService, { profile: values.deployments }),
  );
};

export const makeServicesLayer = (values: EnsforgeServiceValues): Layer.Layer<EnsforgeServices> =>
  Layer.succeedContext(makeServicesContext(values));
