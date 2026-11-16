import type { Account, Address, WalletClient } from "viem";

import type { EnsWriteIntent } from "../../../action/write-intent.js";
import type { Hex } from "../../../schemas/hex.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { CallExecutionResult, ConfirmationPolicy, WriteError } from "../../../write/types.js";

export interface CreateResolverParameters {
  readonly salt: bigint;
  readonly grants?: ReadonlyArray<{ readonly account: Address; readonly roleBitmap: bigint }>;
  readonly admin?: string;
  readonly roles?: bigint;
  readonly setters?: ReadonlyArray<Hex>;
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly confirmation?: ConfirmationPolicy;
}

export interface CreateResolverResult {
  readonly status: "deployed";
  readonly resolver: EthereumAddress;
  readonly implementation: EthereumAddress;
  readonly factory: EthereumAddress;
  readonly call: CallExecutionResult;
}

export type CreateResolverError = WriteError;

export type CreateResolverIntent = EnsWriteIntent<CallExecutionResult, CreateResolverError>;
