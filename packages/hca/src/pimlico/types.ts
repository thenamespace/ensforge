import type { HcaDeploymentProfile } from "@ensforge/contracts/internal";
import type { HcaExecutionPolicy } from "@ensforge/core/legacy/hca";
import type { PimlicoClient } from "permissionless/clients/pimlico";
import type { Address, Chain, Hex, SignableMessage } from "viem";

export interface PimlicoOptions {
  readonly profile: HcaDeploymentProfile;
  readonly chain: Chain;
  readonly client: PimlicoClient<"0.7">;
  /** Local accounts work directly; injected wallets can supply a signMessage callback. */
  readonly owner: {
    readonly address: Address;
    readonly signMessage: (parameters: { message: SignableMessage }) => Promise<Hex>;
  };
  /** ETH sponsorship only. Failure never falls back to account-funded execution. */
  readonly sponsorship?: {
    readonly client?: Pick<PimlicoClient<"0.7">, "getPaymasterData" | "getPaymasterStubData">;
    readonly policyId?: string;
  };
  readonly policy?: HcaExecutionPolicy;
  /** Local review lifetime; the deployed owner validator has no on-chain expiry. */
  readonly reviewLifetimeSeconds?: number;
}

export interface PimlicoExecutionPayload {
  readonly id: string;
  readonly userOperationHash: Hex;
}

export interface PimlicoSubmissionPayload {
  readonly userOperationHash: Hex;
}
