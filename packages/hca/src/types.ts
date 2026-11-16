import type { Schema } from "effect";

import type { EnsAction, HcaError } from "@ensforge/core/legacy";
import type {
  HcaExecutionPolicy,
  ExecutionAdapter,
  PreparedHcaCalls,
  PreparedHcaExecution,
  AuthorizedHcaExecution,
  HcaAdapterSubmission,
  HcaExecutionReview,
  HcaExecutionLocator,
  HcaExecutionCapabilities,
  HcaExecutionStatus,
} from "@ensforge/core/legacy/hca";

export interface VersionedExecution {
  readonly schemaVersion: 1;
  /** Stable, public, credential-free configuration digest. */
  readonly configurationFingerprint: `0x${string}`;
}

export interface PreparedExecution<P> extends PreparedHcaExecution<P>, VersionedExecution {
  readonly review: HcaExecutionReview;
}

export interface AuthorizedExecution<A> extends AuthorizedHcaExecution<A>, VersionedExecution {
  readonly review: HcaExecutionReview;
}

export interface ExecutionSubmission<S> extends HcaAdapterSubmission<S>, VersionedExecution {
  readonly locator: HcaExecutionLocator;
}

export interface SubmissionCodec<S> {
  readonly version: number;
  /** Whitelist tracking fields only; never include credentials, signers or signed operations. */
  readonly schema: Schema.Codec<S, unknown>;
}

export interface ExecutionExtensions {
  readonly sessions?: object;
  readonly crossChain?: object;
  readonly sponsorship?: object;
  readonly recovery?: object;
  readonly cancellation?: object;
  readonly lookup?: object;
}

export type ExecutionOutcome =
  | { readonly status: "cancelled" | "expired"; readonly reason: string }
  | { readonly status: "pending" | "unknown" }
  | {
      readonly status: "succeeded" | "failed";
      readonly receipts: Extract<HcaExecutionStatus, { receipts: unknown }>["receipts"];
    };

export interface ExecutionAdapterDefinition<
  P,
  A,
  S,
  Extensions extends ExecutionExtensions = Record<never, never>,
> {
  readonly id: string;
  readonly chainId: number;
  readonly profileId: string;
  /** Stable across restarts for the same public configuration. Never hash credentials. */
  readonly configurationFingerprint: `0x${string}`;
  readonly capabilities: HcaExecutionCapabilities;
  readonly extensions?: Extensions;
  readonly policy?: HcaExecutionPolicy;
  readonly schemas: {
    readonly prepared: Schema.Codec<P, unknown>;
    readonly authorized: Schema.Codec<A, unknown>;
  };
  readonly submission: SubmissionCodec<S>;
  readonly supports: ExecutionAdapter["supports"];
  readonly prepare: EnsAction<
    PreparedHcaCalls,
    { readonly payload: P; readonly review: HcaExecutionReview },
    HcaError
  >;
  readonly authorize: EnsAction<PreparedExecution<P>, A, HcaError>;
  readonly submit: EnsAction<
    AuthorizedExecution<A>,
    { readonly reference: string; readonly locator: HcaExecutionLocator; readonly payload: S },
    HcaError
  >;
  readonly getStatus: EnsAction<ExecutionSubmission<S>, ExecutionOutcome, HcaError>;
}

export interface TypedExecutionAdapter<
  P,
  A,
  S,
  Extensions extends ExecutionExtensions = Record<never, never>,
> extends ExecutionAdapter<P, A, S> {
  readonly configurationFingerprint: `0x${string}`;
  readonly capabilities: HcaExecutionCapabilities;
  readonly extensions: Extensions;
  readonly prepare: EnsAction<PreparedHcaCalls, PreparedExecution<P>, HcaError>;
  readonly authorize: EnsAction<PreparedExecution<P>, AuthorizedExecution<A>, HcaError>;
  readonly submit: EnsAction<AuthorizedExecution<A>, ExecutionSubmission<S>, HcaError>;
  readonly getStatus: EnsAction<ExecutionSubmission<S>, HcaExecutionStatus<S>, HcaError>;
  readonly serializeSubmission: (submission: ExecutionSubmission<S>) => string;
  readonly restoreSubmission: (
    serialized: string,
    expected: {
      readonly chainId: number;
      readonly hca: `0x${string}`;
      readonly profileId: string;
      readonly planFingerprint: `0x${string}`;
    },
  ) => ExecutionSubmission<S>;
}
