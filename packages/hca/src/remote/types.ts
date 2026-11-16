import { Schema } from "effect";

import { EthereumAddress, type EnsforgeConfig } from "@ensforge/core/legacy";
import { HcaExecutionHash, type HcaRegistrationExecution } from "@ensforge/core/legacy/hca";

export const HcaRemoteRequest = Schema.Struct({
  action: Schema.Literals(["status", "resume", "cancel"]),
  id: Schema.NonEmptyString,
});
export type HcaRemoteRequest = typeof HcaRemoteRequest.Type;

export const HcaRemoteProgress = Schema.Struct({
  id: Schema.NonEmptyString,
  revision: Schema.Int,
  chainId: Schema.Int,
  hca: EthereumAddress,
  status: Schema.Literals([
    "created",
    "waiting",
    "needs-review",
    "needs-funding",
    "needs-authorization",
    "submitting",
    "submitted",
    "registered",
    "cancelled",
    "failed",
    "expired",
  ]),
  readyAt: Schema.optional(Schema.BigInt),
  expiresAt: Schema.optional(Schema.BigInt),
  token: Schema.optional(Schema.Union([EthereumAddress, Schema.Literal("native")])),
  required: Schema.optional(Schema.BigInt),
  balance: Schema.optional(Schema.BigInt),
  transactionHash: Schema.optional(HcaExecutionHash),
});
export type HcaRemoteProgress = typeof HcaRemoteProgress.Type;
export const HcaRemoteProgressJson = Schema.fromJsonString(Schema.toCodecJson(HcaRemoteProgress));

export interface HcaRemoteHandlerOptions<Authentication, Principal> {
  authenticate(authentication: Authentication): Promise<Principal | null>;
  resolveConfig(principal: Principal): Promise<EnsforgeConfig>;
  authorize(input: {
    readonly principal: Principal;
    readonly action: HcaRemoteRequest["action"];
    readonly operationId: string;
    readonly chainId: number;
    readonly hca: string;
    readonly owner: string;
  }): Promise<boolean>;
  /** Explicit server custody. Resolve a signer reference only after authenticating and authorizing. */
  resolveExecution(input: {
    readonly principal: Principal;
    readonly signerReference: string;
    readonly operationId: string;
  }): Promise<HcaRegistrationExecution>;
}
