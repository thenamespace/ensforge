import type { HcaDeploymentProfile } from "@ensforge/contracts/internal";
import type { EnsAction, HcaError } from "@ensforge/core";
import type {
  EnableHcaSessionParameters,
  HcaSessionRefund,
  HcaSessionAuthorization,
  HcaExecutionPolicy,
} from "@ensforge/core/hca";
import type { RhinestoneSDK } from "@rhinestone/sdk";
import type { Account, Chain, Hex } from "viem";

import type { RhinestoneCrossChainOptions } from "./cross-chain/types.js";

export interface RhinestoneOptions {
  readonly profile: HcaDeploymentProfile;
  readonly chain: Chain;
  readonly owner: Account;
  readonly sessionSigner: Account;
  readonly sdk: ConstructorParameters<typeof RhinestoneSDK>[0];
  readonly policy?: HcaExecutionPolicy;
  readonly crossChain?: RhinestoneCrossChainOptions;
  /** Destination execution is sponsored unless a bounded refund is explicitly requested. */
  readonly sponsored?: boolean;
}

export interface PrepareRhinestoneSessionParameters {
  readonly hca: Hex;
  readonly salt?: bigint;
  readonly resolver: Hex;
  readonly validUntil: number;
  readonly refund?: HcaSessionRefund;
}

export interface PreparedRhinestoneSession {
  readonly parameters: EnableHcaSessionParameters & { readonly refund?: HcaSessionRefund };
  readonly sessionNonce: bigint;
  readonly chainId: number;
  readonly profileId: string;
}

export interface RhinestoneSessions {
  readonly prepare: EnsAction<
    PrepareRhinestoneSessionParameters,
    PreparedRhinestoneSession,
    HcaError
  >;
  /** Signs a reusable owner authorization; no transaction or gas is required. */
  readonly enable: EnsAction<PreparedRhinestoneSession, HcaSessionAuthorization, HcaError>;
}

export interface RhinestoneExecutionPayload {
  readonly id: string;
  readonly scopeHash: Hex;
}

export interface RhinestoneSubmissionPayload {
  readonly intentId: string;
}
