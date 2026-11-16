import { Schema } from "effect";

import { Hex } from "../../schemas/hex.js";
import { EthereumAddress } from "../../schemas/identity.js";

export const HcaExecutionHash = Hex.check(Schema.isPattern(/^0x[0-9a-fA-F]{64}$/));

const unsigned = Schema.BigInt.check(Schema.makeFilter<bigint>((n) => n >= 0n));

const chainId = Schema.Int.check(Schema.isGreaterThan(0));

export const HcaExecutionIdentitySchema = Schema.Struct({
  operationId: Schema.optional(Schema.NonEmptyString),
  adapterId: Schema.NonEmptyString,
  instanceId: Schema.NonEmptyString,
  chainId,
  hca: EthereumAddress,
  profileId: Schema.NonEmptyString,
  planFingerprint: HcaExecutionHash,
});

export const HcaExecutionCapabilities = Schema.Struct({
  ownerExecution: Schema.Boolean,
  sessionExecution: Schema.Boolean,
  counterfactualDeployment: Schema.Boolean,
  atomicBatching: Schema.Boolean,
  sponsorship: Schema.Boolean,
  crossChainFunding: Schema.Boolean,
});
export type HcaExecutionCapabilities = typeof HcaExecutionCapabilities.Type;

export const HcaExecutionFee = Schema.Struct({
  kind: Schema.Literals(["execution", "registration", "bridge", "swap"]),
  chainId,
  token: Schema.Union([Schema.Literal("native"), EthereumAddress]),
  expected: unsigned,
  maximum: unsigned,
  sponsored: Schema.Boolean,
});
export type HcaExecutionFee = typeof HcaExecutionFee.Type;

export const HcaAuthorizationRequirement = Schema.Struct({
  kind: Schema.Literals(["message", "typed-data", "transaction"]),
  signer: EthereumAddress,
  description: Schema.NonEmptyString,
  scopeHash: HcaExecutionHash,
});

export const HcaExecutionReview = Schema.Struct({
  expiresAt: Schema.optional(unsigned),
  fees: Schema.Array(HcaExecutionFee),
  authorizations: Schema.Array(HcaAuthorizationRequirement),
  simulation: Schema.Struct({
    scope: Schema.Literal("complete-operation"),
    chainId,
    hca: EthereumAddress,
    evidence: Schema.NonEmptyString,
    blockNumber: Schema.optional(unsigned),
  }),
});
export type HcaExecutionReview = typeof HcaExecutionReview.Type;

export const HcaExecutionLocator = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("transaction"), chainId, hash: HcaExecutionHash }),
  Schema.Struct({
    kind: Schema.Literal("user-operation"),
    chainId,
    entryPoint: EthereumAddress,
    hash: HcaExecutionHash,
  }),
  Schema.Struct({
    kind: Schema.Literal("intent"),
    provider: Schema.NonEmptyString,
    requestId: Schema.NonEmptyString,
  }),
]);
export type HcaExecutionLocator = typeof HcaExecutionLocator.Type;

export const HcaExecutionOutcome = Schema.Union([
  Schema.Struct({
    status: Schema.Literals(["cancelled", "expired"]),
    reason: Schema.NonEmptyString,
  }),
  Schema.Struct({ status: Schema.Literals(["pending", "unknown"]) }),
  Schema.Struct({
    status: Schema.Literals(["succeeded", "failed"]),
    receipts: Schema.Array(
      Schema.Struct({
        transactionHash: HcaExecutionHash,
        blockHash: HcaExecutionHash,
        blockNumber: unsigned,
        status: Schema.Literals(["success", "reverted"]),
      }),
    ),
  }),
]);

export const HcaExecutionFeeLimit = Schema.Struct({
  kind: HcaExecutionFee.fields.kind,
  chainId: HcaExecutionFee.fields.chainId,
  token: HcaExecutionFee.fields.token,
  maximum: HcaExecutionFee.fields.maximum,
});

export const HcaExecutionPolicy = Schema.Struct({
  requireExpiry: Schema.optional(Schema.Boolean),
  feeLimits: Schema.optional(Schema.Array(HcaExecutionFeeLimit)),
});
export type HcaExecutionPolicy = typeof HcaExecutionPolicy.Type;
