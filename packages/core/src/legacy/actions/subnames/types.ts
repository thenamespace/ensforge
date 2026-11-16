import type { Account, Address, WalletClient } from "viem";

import type { EthereumAddress } from "../../schemas/identity.js";
import type { EnsProtocol } from "../../schemas/protocol.js";
import type { WorkflowParameters, WorkflowProgress } from "../../workflows/types.js";
import type {
  CallExecutionResult,
  ConfirmationPolicy,
  WriteError,
  WriteMode,
  WritePlanProgress,
} from "../../write/types.js";
import type { NameState } from "../name/get-name-state/types.js";
import type { SetRecordInput } from "../records/set-records/types.js";
import type { SetResolverAndRecordsResult } from "../resolution/set-resolver-and-records/types.js";

export interface SubnameParameters {
  readonly name: string;
}

export interface CreateSubnameParameters extends WorkflowParameters, SubnameParameters {
  readonly owner: string;
  readonly resolver?: string;
  readonly ttl?: bigint;
  readonly expiry?: bigint;
  readonly fuses?: number;
  readonly roles?: bigint;
  readonly salt?: bigint;
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly mode?: WriteMode;
  readonly confirmation?: ConfirmationPolicy;
  readonly resume?: CreateSubnameResult;
}

export interface CreateSubnameResult extends WorkflowProgress {
  readonly name: string;
  readonly parent: string;
  readonly protocol: EnsProtocol;
  readonly createdRegistry: EthereumAddress | null;
  readonly registry: EthereumAddress;
  readonly write: WritePlanProgress;
  readonly finalState: NameState | null;
}

export interface SetSubnameManagerParameters extends SubnameParameters {
  /** Explicitly accept ENSv2 transfers while parent control or other role assignees remain. */
  readonly unsafe?: boolean;
  readonly manager: string;
}

export interface SetSubnameResolverParameters extends SubnameParameters {
  readonly resolver: string;
}

export interface SetSubnameExpiryParameters extends SubnameParameters {
  readonly expiry: bigint;
}

export interface SetSubnameRecordParameters extends CreateSubnameParameters {
  readonly records?: ReadonlyArray<SetRecordInput>;
}

export interface SetSubnameRecordResult {
  readonly name: string;
  readonly protocol: EnsProtocol;
  readonly created: boolean;
  readonly registry: EthereumAddress;
  readonly resolver: EthereumAddress | null;
  readonly resolverWrite: SetResolverAndRecordsResult | null;
  readonly create: CreateSubnameResult | null;
  readonly mutations: ReadonlyArray<CallExecutionResult>;
  readonly finalState: NameState;
}

export interface TransferSubnameParameters extends SubnameParameters {
  /** Explicitly accept ENSv2 transfers while parent control or other role assignees remain. */
  readonly unsafe?: boolean;
  readonly to: string;
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly mode?: WriteMode;
  readonly confirmation?: ConfirmationPolicy;
}

export type SubnameWriteResult = CallExecutionResult;

export type SubnameError = WriteError;
