import { type Address, type Hex } from "viem";

import type { WalletOverrides } from "../../../write/types.js";

export interface EnableHcaSessionParameters extends WalletOverrides {
  readonly hca: Address;
  readonly salt?: bigint;
  readonly permissionId?: Hex;
  readonly sessionKey: Address;
  readonly validUntil: number;
  readonly resolver: Address;
}
