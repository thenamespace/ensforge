import type { Address, Hex, TransactionReceipt } from "viem";

import type { WalletOverrides, ConfirmationPolicy } from "../../write/types.js";

export interface HcaSigningDomain {
  readonly fields: Hex;
  readonly name: string;
  readonly version: string;
  readonly chainId: bigint;
  readonly verifyingContract: Address;
  readonly salt: Hex;
  readonly extensions: readonly bigint[];
}

export interface HcaModulePageParameters {
  readonly cursor?: Address;
  readonly size?: bigint;
}

export interface HcaModulePage {
  readonly modules: readonly Address[];
  readonly nextCursor: Address;
}

export interface HcaManagementParameters extends WalletOverrides {
  readonly hca: Address;
  readonly salt?: bigint;
  readonly confirmation?: ConfirmationPolicy;
}

export interface HcaManagementResult {
  readonly hash: Hex;
  readonly receipt: TransactionReceipt | null;
}

export interface HcaUpgradeEligibility {
  readonly hca: Address;
  readonly implementation: Address;
  readonly currentImplementation: Address;
  readonly currentGate: Address;
  readonly predecessorGate: Address;
  readonly targetApproved: boolean;
  readonly predecessorApproved: boolean;
  readonly canUpgradeFrom: boolean;
  readonly compatibleProxy: boolean;
  readonly eligible: boolean;
  readonly blockNumber: bigint;
}
