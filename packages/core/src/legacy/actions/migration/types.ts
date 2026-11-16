import { Schema } from "effect";

import type { Account, Address, WalletClient } from "viem";

import type { EnsAction } from "../../action/action.js";
import type { BlockParameters } from "../../action/block.js";
import type { EnsWriteIntent } from "../../action/write-intent.js";
import { EthereumAddress } from "../../schemas/identity.js";
import { NormalizedName } from "../../schemas/name.js";
import type { WorkflowParameters, WorkflowProgress } from "../../workflows/types.js";
import type {
  CallExecutionResult,
  ConfirmationPolicy,
  WriteError,
  WriteMode,
  WritePlanProgress,
} from "../../write/types.js";
import type { GetNameStateError } from "../name/get-name-state/types.js";
import type { NameState } from "../name/get-name-state/types.js";

export type MigrationReadError = GetNameStateError;

export type MigrationNameParameters = { readonly name: string } & BlockParameters;

export const MigrationUnsupportedReason = Schema.Literals([
  "ENSV2_NOT_ACTIVE",
  "NOT_ETH_NAME",
  "NAME_NOT_RESERVED",
]);
export type MigrationUnsupportedReason = typeof MigrationUnsupportedReason.Type;

export const MigrationStatus = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("unsupported"),
    name: NormalizedName,
    reason: MigrationUnsupportedReason,
  }),
  Schema.Struct({
    status: Schema.Literal("not-required"),
    name: NormalizedName,
    reason: Schema.Literals(["V2_NATIVE", "AVAILABLE"]),
  }),
  Schema.Struct({ status: Schema.Literal("reserved-unwrapped"), name: NormalizedName }),
  Schema.Struct({
    status: Schema.Literal("locked-child-pending-parent"),
    name: NormalizedName,
    parent: NormalizedName,
    fuses: Schema.Int,
  }),
  Schema.Struct({
    status: Schema.Literal("reserved-wrapped-unlocked"),
    name: NormalizedName,
    fuses: Schema.Int,
  }),
  Schema.Struct({
    status: Schema.Literal("reserved-wrapped-locked"),
    name: NormalizedName,
    fuses: Schema.Int,
  }),
  Schema.Struct({
    status: Schema.Literal("mirrored-child"),
    name: NormalizedName,
    parentRegistry: EthereumAddress,
    fuses: Schema.Int,
  }),
  Schema.Struct({ status: Schema.Literal("migrated-unlocked"), name: NormalizedName }),
  Schema.Struct({
    status: Schema.Literal("migrated-locked"),
    name: NormalizedName,
    registry: EthereumAddress,
  }),
]);
export type MigrationStatus = typeof MigrationStatus.Type;

export const MigrationTarget = Schema.Union([
  Schema.Struct({
    supported: Schema.Literal(false),
    name: NormalizedName,
    reason: Schema.Literals([
      "MIGRATION_UNSUPPORTED",
      "MIGRATION_NOT_REQUIRED",
      "PARENT_NOT_MIGRATED",
    ]),
  }),
  Schema.Struct({
    supported: Schema.Literal(true),
    name: NormalizedName,
    route: Schema.Literals(["unwrapped", "wrapped-unlocked", "wrapped-locked", "locked-child"]),
    tokenContract: EthereumAddress,
    tokenId: Schema.BigInt,
    tokenStandard: Schema.Literals(["erc721", "erc1155"]),
    receiver: EthereumAddress,
  }),
]);
export type MigrationTarget = typeof MigrationTarget.Type;

export const MigrationBlocker = Schema.Literals([
  "ENSV2_NOT_ACTIVE",
  "NOT_ETH_NAME",
  "NAME_NOT_RESERVED",
  "NAME_ALREADY_MIGRATED",
  "NAME_AVAILABLE",
  "ACCOUNT_NOT_OWNER_OR_OPERATOR",
  "PARENT_NOT_MIGRATED",
  "INVALID_WRAPPER_STATE",
  "FROZEN_TOKEN_APPROVAL",
  "TRANSFER_DISABLED",
]);
export type MigrationBlocker = typeof MigrationBlocker.Type;

export const MigrationEligibility = Schema.Struct({
  name: NormalizedName,
  eligible: Schema.Boolean,
  status: MigrationStatus,
  target: MigrationTarget,
  account: EthereumAddress,
  owner: Schema.NullOr(EthereumAddress),
  authorized: Schema.Boolean,
  blockers: Schema.Array(MigrationBlocker),
});
export type MigrationEligibility = typeof MigrationEligibility.Type;

export const MigrationPlan = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("unsupported"),
    name: NormalizedName,
    blockers: Schema.Array(MigrationBlocker),
  }),
  Schema.Struct({
    status: Schema.Literal("not-required"),
    name: NormalizedName,
    reason: Schema.Literals(["V2_NATIVE", "AVAILABLE", "ALREADY_MIGRATED"]),
  }),
  Schema.Struct({
    status: Schema.Literal("blocked"),
    name: NormalizedName,
    blockers: Schema.Array(MigrationBlocker),
  }),
  Schema.Struct({
    status: Schema.Literal("authorization-required"),
    name: NormalizedName,
    account: EthereumAddress,
    owner: EthereumAddress,
    target: MigrationTarget,
  }),
  Schema.Struct({
    status: Schema.Literal("ready"),
    name: NormalizedName,
    target: MigrationTarget,
    migration: Schema.Struct({
      label: Schema.String,
      owner: EthereumAddress,
      resolver: EthereumAddress,
      subregistry: EthereumAddress,
    }),
    warnings: Schema.Array(
      Schema.Literals(["SUBREGISTRY_IGNORED_FOR_LOCKED_NAME", "RESOLVER_MAY_BE_PRESERVED"]),
    ),
  }),
]);
export type MigrationPlan = typeof MigrationPlan.Type;

export interface MigrationValues {
  readonly owner?: EthereumAddress;
  readonly resolver?: EthereumAddress;
  readonly subregistry?: EthereumAddress;
}

export interface ApproveMigrationParameters {
  readonly name: string;
  readonly approved?: boolean;
}

export interface MigrateNameCallParameters extends MigrationValues {
  readonly name: string;
}

export interface MigrationWalletParameters {
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly mode?: WriteMode;
  readonly confirmation?: ConfirmationPolicy;
}

export interface MigrationNameProgress extends WorkflowProgress {
  readonly status: "completed" | "partial";
  readonly name: string;
  readonly route: Extract<MigrationTarget, { readonly supported: true }>["route"];
  readonly steps: ReadonlyArray<{
    readonly name: string;
    readonly route: Extract<MigrationTarget, { readonly supported: true }>["route"];
  }>;
  readonly write: WritePlanProgress;
  readonly finalState: NameState | null;
}

type MigrateNameResultState =
  | MigrationNameProgress
  | {
      readonly status: "not-required";
      readonly name: string;
      readonly reason: "V2_NATIVE" | "AVAILABLE" | "ALREADY_MIGRATED";
      readonly write: null;
      readonly finalState: NameState;
    };

export interface MigrateNameParameters
  extends WorkflowParameters, MigrateNameCallParameters, MigrationWalletParameters {
  readonly migrateParent?: boolean;
  readonly resume?: MigrationNameProgress;
}

export interface MigrateNameAction extends EnsAction<
  MigrateNameParameters,
  MigrateNameResult,
  WriteError
> {
  readonly call: (
    parameters: MigrateNameCallParameters,
  ) => EnsWriteIntent<CallExecutionResult, WriteError>;
}

export interface MigrationBatchApproval {
  readonly token: EthereumAddress;
  readonly owner: EthereumAddress;
  readonly operator: EthereumAddress;
  readonly required: boolean;
}

export interface MigrationBatchEntry {
  readonly name: string;
  readonly status: "completed" | "partial" | "not-required";
  readonly route: Extract<MigrationTarget, { readonly supported: true }>["route"] | null;
  readonly finalState: NameState | null;
}

export interface MigrationBatchProgress extends WorkflowProgress {
  readonly status: "completed" | "partial";
  readonly strategy: "helper" | "sequential";
  readonly migrations: ReadonlyArray<MigrationBatchEntry>;
  readonly approvals: ReadonlyArray<MigrationBatchApproval>;
  readonly steps: ReadonlyArray<{
    readonly name: string;
    readonly route: Extract<MigrationTarget, { readonly supported: true }>["route"];
  }>;
  readonly write: WritePlanProgress;
}

export interface MigrateNamesParameters extends WorkflowParameters, MigrationWalletParameters {
  readonly migrations: ReadonlyArray<MigrateNameCallParameters>;
  readonly resume?: MigrationBatchProgress;
}

export type ApproveMigrationResult = CallExecutionResult;

export type MigrationWriteError = WriteError;

export type MigrateNameResult = MigrateNameResultState & WorkflowProgress;
