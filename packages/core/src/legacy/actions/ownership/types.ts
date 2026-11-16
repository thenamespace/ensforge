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

export type TtlResult =
  | { readonly supported: true; readonly protocol: "v1"; readonly ttl: bigint }
  | { readonly supported: false; readonly protocol: "v2"; readonly reason: "TTL_UNSUPPORTED" };

export interface SetTtlParameters {
  readonly name: string;
  readonly ttl: bigint;
}

export interface SetManagerParameters {
  readonly name: string;
  readonly manager: string;
}

export interface TransferRegistrantParameters {
  readonly name: string;
  readonly to: string;
}

export interface ReclaimNameParameters {
  readonly name: string;
  readonly manager: string;
}

export type OwnershipWriteResult = CallExecutionResult;

export type OwnershipWriteError = WriteError;

export type TransferNameStrategy =
  | "registry"
  | "registrar-and-manager"
  | "name-wrapper"
  | "v2-registry";

export interface TransferNameProgress extends WorkflowProgress {
  readonly name: string;
  readonly protocol: EnsProtocol;
  readonly strategy: TransferNameStrategy;
  readonly from: EthereumAddress;
  readonly to: EthereumAddress;
  readonly write: WritePlanProgress;
  readonly finalState: NameState | null;
}

export interface TransferNameParameters extends WorkflowParameters {
  /** Explicitly accept ENSv2 transfers while parent control or other role assignees remain. */
  readonly unsafe?: boolean;
  readonly name: string;
  readonly to: string;
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly mode?: WriteMode;
  readonly confirmation?: ConfirmationPolicy;
  readonly resume?: TransferNameProgress;
}

export type TransferNameResult = TransferNameProgress;

export type TransferNameError = WriteError;
