import type {
  Account,
  Address,
  Hex,
  TransactionReceipt,
  WalletCallReceipt,
  WalletClient,
} from "viem";

import type { EnsWriteIntent } from "../action/write-intent.js";
import type { ConfirmationPolicy } from "../config/write-options.js";
import type { AuthorizationError } from "../errors/authorization-error.js";
import type { CodecError } from "../errors/codec-error.js";
import type { ConfigError } from "../errors/config-error.js";
import type { ContractError } from "../errors/contract-error.js";
import type { DnsImportError } from "../errors/dns-import-error.js";
import type { HcaError } from "../errors/hca-error.js";
import type { MigrationError } from "../errors/migration-error.js";
import type { NameError } from "../errors/name-error.js";
import type { RegistrationError } from "../errors/registration-error.js";
import type { RenewalError } from "../errors/renewal-error.js";
import type { ReverseNameError } from "../errors/reverse-name-error.js";
import type { RpcError } from "../errors/rpc-error.js";
import type { TransactionError } from "../errors/transaction-error.js";
import type { WalletError } from "../errors/wallet-error.js";
import type { WorkflowError } from "../errors/workflow-error.js";
import type { WritePlanError } from "../errors/write-plan-error.js";
import type { EnsProtocol } from "../schemas/protocol.js";

export type { ConfirmationPolicy } from "../config/write-options.js";

export const WriteMode = Schema.Literals(["auto", "batch", "sequential"]);
export type WriteMode = typeof WriteMode.Type;

export const WriteAtomicity = Schema.Literals(["none", "preferred", "required"]);
export type WriteAtomicity = typeof WriteAtomicity.Type;

export type WriteError =
  | WorkflowError
  | HcaError
  | AuthorizationError
  | CodecError
  | ConfigError
  | ContractError
  | DnsImportError
  | NameError
  | MigrationError
  | RpcError
  | RegistrationError
  | RenewalError
  | ReverseNameError
  | TransactionError
  | WalletError
  | WritePlanError;

export interface WalletOverrides {
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
}

export interface PreparedWriteCall {
  readonly id: string;
  readonly operation: string;
  readonly protocol?: EnsProtocol;
  readonly account: Account | Address;
  readonly chainId: number;
  readonly to: Address;
  readonly data?: Hex;
  readonly value: bigint;
}

export interface SimulatedWriteCall {
  readonly call: PreparedWriteCall;
  readonly result: Hex | undefined;
}

export type WriteReceipt = TransactionReceipt | WalletCallReceipt<bigint, "success" | "reverted">;

export type CallExecutionResult =
  | {
      readonly id: string;
      readonly operation: string;
      readonly status: "not-started";
      readonly hash: null;
      readonly receipt: null;
    }
  | {
      readonly id: string;
      readonly operation: string;
      readonly status: "submitted";
      readonly hash: Hex | null;
      readonly receipt: null;
    }
  | {
      readonly id: string;
      readonly operation: string;
      readonly status: "confirmed";
      readonly hash: Hex | null;
      readonly receipt: WriteReceipt | null;
    };

export interface WalletCapabilitiesResult {
  readonly chainId: number;
  readonly nativeCalls: boolean;
  readonly atomicity: "supported" | "ready" | "unsupported" | "unavailable";
  readonly paymasterService: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface GetCallsStatusParameters extends WalletOverrides {
  readonly id: string;
}

export interface CallsStatusResult {
  readonly id: string;
  readonly chainId: number;
  readonly status: "pending" | "success" | "failure" | "unknown";
  readonly statusCode: number;
  readonly atomic: boolean;
  readonly receipts: ReadonlyArray<WriteReceipt>;
}

export interface ResumeCallsParameters extends WalletOverrides {
  readonly batch: NativeBatchResult;
  readonly confirmation?: ConfirmationPolicy;
}

export interface SequentialCallsResult {
  readonly mode: "sequential";
  readonly atomic: false;
  readonly status: "completed" | "partial";
  readonly calls: ReadonlyArray<CallExecutionResult>;
  readonly failure: WriteError | null;
}

export interface NativeBatchResult {
  readonly mode: "batch";
  readonly atomic: boolean;
  readonly status: "submitted" | "confirmed";
  readonly id: string;
  readonly calls: ReadonlyArray<CallExecutionResult>;
  readonly receipts: ReadonlyArray<WriteReceipt>;
  readonly capabilities: WalletCapabilitiesResult;
}

export type SendCallsResult = SequentialCallsResult | NativeBatchResult;

export interface PrepareCallsParameters extends WalletOverrides {
  readonly calls: ReadonlyArray<EnsWriteIntent<unknown, WriteError>>;
}

export interface SimulateCallsParameters extends PrepareCallsParameters {}

export type FeeEstimate =
  | {
      readonly type: "eip1559";
      readonly maxFeePerGas: bigint;
      readonly maxPriorityFeePerGas: bigint;
    }
  | {
      readonly type: "legacy";
      readonly gasPrice: bigint;
    };

export type CallEstimate =
  | {
      readonly status: "estimated";
      readonly call: PreparedWriteCall;
      readonly gas: bigint;
      readonly fee: bigint;
      readonly value: bigint;
      readonly maximumCost: bigint;
    }
  | {
      readonly status: "unavailable";
      readonly call: PreparedWriteCall;
      readonly error: ContractError | RpcError;
    };

export interface EstimateCallsParameters extends PrepareCallsParameters {}

export interface EstimateCallsResult {
  readonly blockNumber: bigint;
  readonly fee: FeeEstimate;
  readonly calls: ReadonlyArray<CallEstimate>;
  readonly totals: {
    readonly gas: bigint;
    readonly fee: bigint;
    readonly value: bigint;
    readonly maximumCost: bigint;
  };
}

export interface SendCallsParameters extends PrepareCallsParameters {
  readonly mode?: WriteMode;
  readonly atomicity?: WriteAtomicity;
  readonly confirmation?: ConfirmationPolicy;
  readonly simulation?: "required" | "skip";
  readonly capabilities?: Readonly<Record<string, unknown>>;
}

export interface GetWalletCapabilitiesParameters extends WalletOverrides {}

export type WriteWaitCondition =
  | { readonly type: "timestamp"; readonly target: bigint }
  | { readonly type: "block"; readonly target: bigint };

export type WriteStage =
  | {
      readonly type: "calls";
      readonly id: string;
      readonly calls: ReadonlyArray<EnsWriteIntent<unknown, WriteError>>;
      readonly mode?: WriteMode;
      readonly atomicity?: WriteAtomicity;
      readonly confirmation?: ConfirmationPolicy;
    }
  | {
      readonly type: "wait";
      readonly id: string;
      readonly condition: WriteWaitCondition;
    };

export interface WritePlan {
  readonly id: string;
  readonly stages: ReadonlyArray<WriteStage>;
}

export interface WriteStageResult {
  readonly id: string;
  readonly result: SendCallsResult;
}

export interface WritePlanProgress {
  readonly planId: string;
  readonly status: "completed" | "waiting" | "partial" | "submitted";
  readonly completedStages: ReadonlyArray<WriteStageResult>;
  readonly currentStage: string | null;
  readonly nextActionAt: bigint | null;
  readonly failure: WriteError | null;
}

export interface ExecuteWritePlanParameters extends WalletOverrides {
  readonly plan: WritePlan;
  readonly resume?: WritePlanProgress;
}

import { Schema } from "effect";
