import type { Account, Address, WalletClient } from "viem";

import type { Hex } from "../../../schemas/hex.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { EnsProtocol } from "../../../schemas/protocol.js";
import type { WorkflowParameters, WorkflowProgress } from "../../../workflows/types.js";
import type { ConfirmationPolicy, WriteError, WritePlanProgress } from "../../../write/types.js";
import type { SetRecordInput } from "../../records/set-records/types.js";

export type ResolverSource = "existing" | "provided" | "selected" | "deployed";

export interface SetResolverAndRecordsProgress extends WorkflowProgress {
  readonly protocol: EnsProtocol;
  readonly resolver: EthereumAddress;
  readonly resolverSource: ResolverSource;
  readonly write: WritePlanProgress;
}

export interface SetResolverAndRecordsParameters extends WorkflowParameters {
  readonly name: string;
  readonly records: ReadonlyArray<SetRecordInput>;
  readonly resolver?: string;
  readonly salt?: bigint;
  readonly admin?: string;
  readonly roles?: bigint;
  readonly setters?: ReadonlyArray<Hex>;
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly confirmation?: ConfirmationPolicy;
  readonly resume?: SetResolverAndRecordsProgress;
}

export type SetResolverAndRecordsResult = SetResolverAndRecordsProgress;

export type SetResolverAndRecordsError = WriteError;
