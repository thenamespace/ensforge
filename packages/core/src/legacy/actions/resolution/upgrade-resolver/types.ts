import type { Account, Address, WalletClient } from "viem";

import type { EnsWriteIntent } from "../../../action/write-intent.js";
import type { Hex } from "../../../schemas/hex.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { CallExecutionResult, ConfirmationPolicy, WriteError } from "../../../write/types.js";

export interface UpgradeResolverParameters {
  readonly name: string;
  readonly implementation?: string;
  readonly data?: Hex;
  readonly force?: boolean;
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly confirmation?: ConfirmationPolicy;
}

export type UpgradeResolverResult =
  | {
      readonly status: "current";
      readonly resolver: EthereumAddress;
      readonly implementation: EthereumAddress;
      readonly call: null;
    }
  | {
      readonly status: "upgraded";
      readonly resolver: EthereumAddress;
      readonly previousImplementation: EthereumAddress;
      readonly implementation: EthereumAddress;
      readonly call: CallExecutionResult;
    };

export type UpgradeResolverError = WriteError;

export type UpgradeResolverIntent = EnsWriteIntent<CallExecutionResult, UpgradeResolverError>;
