import { Schema } from "effect";

import type { EnsAction } from "../../action/action.js";
import type { HcaError } from "../../errors/hca-error.js";
import { EthereumAddress } from "../../schemas/identity.js";
import {
  HcaExecutionFeeLimit,
  HcaExecutionHash,
  type HcaExecutionReview,
} from "./execution-contract.js";
import type { HcaStorage } from "./storage.js";
import {
  HcaSalt,
  HcaSessionAuthorizationSchema,
  type ExecutionAdapter,
  type HcaAdapterSubmission,
  type HcaExecutionSubmission,
  type PreparedHcaCalls,
  type PreparedHcaExecution,
} from "./types.js";

const authorization = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("owner") }),
  Schema.Struct({
    kind: Schema.Literal("session"),
    session: HcaSessionAuthorizationSchema,
  }),
]);

export const HcaRegistrationLimits = Schema.Struct({
  registrationPrice: HcaSalt,
  fees: Schema.Array(HcaExecutionFeeLimit),
});
export type HcaRegistrationLimits = typeof HcaRegistrationLimits.Type;

const tracking = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("transaction"), hash: HcaExecutionHash }),
  Schema.Struct({ kind: Schema.Literal("adapter"), serialized: Schema.NonEmptyString }),
]);

const attempt = Schema.Struct({
  step: Schema.Literals(["commit", "register"]),
  planFingerprint: HcaExecutionHash,
  /** Useful for external reconciliation even when the provider response was lost. */
  userOperationHash: Schema.optional(HcaExecutionHash),
  tracking: Schema.optional(tracking),
});

export const HcaRegistrationProgress = Schema.Union([
  Schema.Struct({ status: Schema.Literal("created") }),
  Schema.Struct({ status: Schema.Literal("waiting"), readyAt: HcaSalt, expiresAt: HcaSalt }),
  Schema.Struct({ status: Schema.Literal("needs-review"), reason: Schema.NonEmptyString }),
  Schema.Struct({
    status: Schema.Literal("needs-funding"),
    token: Schema.Union([EthereumAddress, Schema.Literal("native")]),
    required: HcaSalt,
    balance: HcaSalt,
  }),
  Schema.Struct({ status: Schema.Literal("needs-authorization"), reason: Schema.NonEmptyString }),
  Schema.Struct({ status: Schema.Literals(["submitting", "submitted"]), attempt }),
  Schema.Struct({ status: Schema.Literal("registered"), transactionHash: HcaExecutionHash }),
  Schema.Struct({
    status: Schema.Literals(["cancelled", "failed", "expired"]),
    reason: Schema.NonEmptyString,
  }),
]);
export type HcaRegistrationProgress = typeof HcaRegistrationProgress.Type;

export const HcaRegistrationOperation = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  id: Schema.NonEmptyString,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  chainId: Schema.Int.check(Schema.isGreaterThan(0)),
  profileId: Schema.NonEmptyString,
  hca: EthereumAddress,
  owner: EthereumAddress,
  salt: HcaSalt,
  registration: Schema.Struct({
    name: Schema.NonEmptyString,
    duration: HcaSalt,
    secret: HcaExecutionHash,
    commitment: HcaExecutionHash,
    registrar: EthereumAddress,
    resolver: EthereumAddress,
    paymentToken: EthereumAddress,
    subregistry: EthereumAddress,
    referrer: HcaExecutionHash,
    primaryName: Schema.Boolean,
  }),
  authorization,
  signerReference: Schema.optional(Schema.NonEmptyString),
  route: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("owner") }),
    Schema.Struct({
      kind: Schema.Literal("adapter"),
      id: Schema.NonEmptyString,
      instanceId: Schema.NonEmptyString,
    }),
  ]),
  limits: HcaRegistrationLimits,
  progress: HcaRegistrationProgress,
  commitmentSubmission: Schema.optional(attempt),
  registrationSubmission: Schema.optional(attempt),
  createdAt: HcaSalt,
  updatedAt: HcaSalt,
});
export type HcaRegistrationOperation = typeof HcaRegistrationOperation.Type;

/** Implement these operations atomically. Store copies, never shared mutable references. */
export interface HcaRegistrationStorage {
  create(operation: HcaRegistrationOperation): Promise<boolean>;
  get(id: string): Promise<HcaRegistrationOperation | null>;
  compareAndSwap(parameters: {
    id: string;
    expectedRevision: number;
    operation: HcaRegistrationOperation;
  }): Promise<boolean>;
}

/** Persistence remains provider-owned, so core never serializes opaque signed payloads. */
export interface HcaRegistrationExecution extends ExecutionAdapter {
  readonly prepare: EnsAction<
    PreparedHcaCalls,
    PreparedHcaExecution & { readonly review: HcaExecutionReview },
    HcaError
  >;
  serializeSubmission(submission: HcaAdapterSubmission): string;
  restoreSubmission(
    serialized: string,
    expected: {
      chainId: number;
      hca: `0x${string}`;
      profileId: string;
      planFingerprint: `0x${string}`;
    },
  ): HcaAdapterSubmission;
}

export interface HcaRegistrationContext {
  readonly storage?: HcaStorage | HcaRegistrationStorage;
  readonly execution?: HcaRegistrationExecution;
}
export interface GetHcaRegistrationParameters extends HcaRegistrationContext {
  readonly id: string;
}
export interface ResumeHcaRegistrationParameters extends GetHcaRegistrationParameters {
  /** Explicitly replace accepted spending bounds before continuing. */
  readonly limits?: HcaRegistrationLimits;
  /** Rebind a renewed session explicitly; owner and registration inputs stay fixed. */
  readonly authorization?: typeof authorization.Type;
  readonly signerReference?: string;
  /** Recover a submission whose broadcast succeeded but whose response was not persisted. */
  readonly submission?: HcaExecutionSubmission;
}
export interface StartHcaRegistrationParameters extends HcaRegistrationContext {
  /** Optional explicit ID. Otherwise matching unfinished registrations are resumed. */
  readonly id?: string;
  readonly hca: `0x${string}`;
  readonly salt?: bigint;
  readonly name: string;
  readonly duration: bigint;
  readonly resolver: `0x${string}`;
  readonly paymentToken: `0x${string}`;
  readonly subregistry?: `0x${string}`;
  readonly referrer?: `0x${string}`;
  readonly primaryName?: boolean;
  readonly authorization: typeof authorization.Type;
  readonly signerReference?: string;
  readonly limits: HcaRegistrationLimits;
}
