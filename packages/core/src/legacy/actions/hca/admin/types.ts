import type { Address } from "viem";

import type { WalletOverrides, ConfirmationPolicy } from "../../../write/types.js";

export type HcaGovernanceTarget =
  | { readonly kind: "factory" }
  | { readonly kind: "upgradeGate"; readonly address?: Address };

export interface HcaAdminWriteParameters extends WalletOverrides {
  readonly confirmation?: ConfirmationPolicy;
}
