import { Schema, type Effect } from "effect";

import type { Address, Hex, TransactionReceipt } from "viem";

import type { BlockParameters } from "../../action/block.js";
import type { EnsWriteIntent } from "../../action/write-intent.js";
import type { EnsforgeConfig } from "../../config/config.js";
import type { HcaError } from "../../errors/hca-error.js";
import { Hex as HexSchema } from "../../schemas/hex.js";
import { EthereumAddress } from "../../schemas/identity.js";
import type { WalletOverrides, WriteError } from "../../write/types.js";
import type { HcaExecutionCapabilities } from "./execution-contract.js";

export const HcaSalt = Schema.BigInt.check(
  Schema.makeFilter<bigint>((value) =>
    value >= 0n && value < 1n << 256n ? true : "Expected uint256",
  ),
);

export const HcaCall = Schema.Struct({
  to: EthereumAddress,
  data: Schema.optional(HexSchema),
  value: Schema.optional(HcaSalt),
});
export type HcaCall = typeof HcaCall.Type;

export type HcaErrorResult = WriteError;

export type HcaReadParameters = BlockParameters & { readonly hca: Address };

export type HcaDerivationParameters = BlockParameters & {
  readonly owner: Address;
  readonly salt?: bigint;
  readonly implementation?: Address;
};

export type VerifyHcaParameters = HcaReadParameters & {
  readonly expectedOwner?: Address;
  readonly salt?: bigint;
  readonly initialImplementation?: Address;
  /** Verify deterministic deployment inputs when expectedOwner is provided. */
  readonly allowUndeployed?: boolean;
};

export type HcaState =
  | {
      readonly status: "undeployed";
      readonly address: Address;
      readonly chainId: number;
      readonly blockNumber: bigint;
    }
  | {
      readonly status: "deployed";
      readonly address: Address;
      readonly chainId: number;
      readonly blockNumber: bigint;
      readonly owner: Address;
      readonly implementation: Address;
      readonly accountId: string;
      readonly sessionNonce: bigint;
    };

export interface VerifiedHcaAccount {
  /** False means only the deterministic deployment inputs have been verified. */
  readonly deployed?: boolean;
  readonly kind: "ens-hca";
  readonly address: Address;
  readonly owner: Address;
  readonly chainId: number;
  readonly profileId: string;
  readonly initialImplementation: Address;
  readonly currentImplementation: Address;
  readonly salt: bigint;
  readonly sessionNonce: bigint;
  readonly verifiedAtBlock: bigint;
}

export interface HcaSessionRefund {
  readonly token: Address;
  readonly maxExchangeRate: bigint;
  readonly maxGasOverhead: bigint;
  readonly maxAmount: bigint;
}

const sessionUint96 = Schema.BigInt.check(
  Schema.makeFilter<bigint>((value) => value >= 0n && value < 1n << 96n),
);
const sessionUint48 = Schema.Number.check(
  Schema.makeFilter<number>(
    (value) => Number.isSafeInteger(value) && value >= 0 && value < 2 ** 48,
  ),
);

export const HcaSessionAuthorizationSchema = Schema.Struct({
  hca: EthereumAddress,
  chainId: Schema.Number.check(
    Schema.makeFilter<number>((value) => Number.isSafeInteger(value) && value > 0),
  ),
  permissionId: HexSchema.check(Schema.makeFilter<string>((value) => value.length === 66)),
  ownerSignature: HexSchema.check(Schema.makeFilter<string>((value) => value.length === 132)),
  sessionKey: EthereumAddress.check(Schema.makeFilter<string>((value) => BigInt(value) !== 0n)),
  resolver: EthereumAddress,
  validUntil: sessionUint48,
  sessionNonce: sessionUint96,
  refund: Schema.Struct({
    token: EthereumAddress.check(Schema.makeFilter<string>((value) => BigInt(value) !== 0n)),
    maxExchangeRate: sessionUint96.check(Schema.makeFilter<bigint>((value) => value > 0n)),
    maxGasOverhead: Schema.BigInt.check(
      Schema.makeFilter<bigint>((value) => value >= 0n && value < 1n << 48n),
    ),
    maxAmount: sessionUint96.check(Schema.makeFilter<bigint>((value) => value > 0n)),
  }),
});

export interface HcaSessionPolicy {
  readonly sessionKey: Address;
  readonly resolver: Address;
  readonly validUntil: number;
  readonly sessionNonce: bigint;
  readonly refund?: HcaSessionRefund | undefined;
}

/** Reusable owner-signed authorization. It is bound to this account, chain and session nonce. */
export interface HcaSessionAuthorization extends HcaSessionPolicy {
  readonly refund: HcaSessionRefund;
  readonly hca: Address;
  readonly chainId: number;
  readonly permissionId: Hex;
  readonly ownerSignature: Hex;
}

export interface VerifiedHcaSession extends HcaSessionAuthorization {
  readonly salt: Hex;
  readonly sessionDigest: Hex;
}

export type HcaAuthorization =
  | { readonly kind: "owner" }
  | { readonly kind: "session"; readonly session: HcaSessionAuthorization };

export interface PrepareHcaCallsParameters extends WalletOverrides {
  /** Required to prepare deployment and execution of an undeployed HCA. */
  readonly counterfactualOwner?: Address;
  readonly operationId?: string;
  readonly requiredCapabilities?: readonly (keyof HcaExecutionCapabilities)[];
  readonly hca: Address;
  readonly salt?: bigint;
  readonly authorization: HcaAuthorization;
  readonly calls: readonly (HcaCall | EnsWriteIntent<unknown, WriteError>)[];
}

export interface PreparedHcaCalls {
  readonly operationId?: string;
  readonly requiredCapabilities?: readonly (keyof HcaExecutionCapabilities)[];
  readonly account: VerifiedHcaAccount;
  readonly authorization: HcaAuthorization;
  readonly session?: VerifiedHcaSession;
  readonly calls: readonly { readonly to: Address; readonly data: Hex; readonly value: bigint }[];
  readonly value: bigint;
  readonly data: Hex;
  readonly fingerprint: Hex;
  readonly simulation: "required";
}

export interface HcaExecutionIdentity {
  readonly operationId?: string | undefined;
  readonly adapterId: string;
  readonly instanceId: string;
  readonly chainId: number;
  readonly hca: Address;
  readonly profileId: string;
  readonly planFingerprint: Hex;
}

export interface PreparedHcaExecution<Payload = unknown> extends HcaExecutionIdentity {
  readonly payload: Payload;
  readonly simulation: "succeeded";
}

export interface AuthorizedHcaExecution<Payload = unknown> extends HcaExecutionIdentity {
  readonly payload: Payload;
}

export interface HcaAdapterSubmission<Payload = unknown> extends HcaExecutionIdentity {
  readonly kind: "adapter";
  readonly reference: string;
  readonly payload: Payload;
}

export interface HcaTransactionSubmission {
  readonly operationId?: string;
  readonly kind: "transaction";
  readonly chainId: number;
  readonly hca: Address;
  readonly owner: Address;
  readonly profileId: string;
  readonly hash: Hex;
  readonly planFingerprint: Hex;
}

export type HcaExecutionSubmission<Payload = unknown> =
  | HcaTransactionSubmission
  | HcaAdapterSubmission<Payload>;

export type HcaExecutionStatus<Payload = unknown> =
  | {
      readonly status: "cancelled" | "expired";
      readonly reason: string;
      readonly submission: HcaExecutionSubmission<Payload>;
    }
  | { readonly status: "pending" | "unknown"; readonly submission: HcaExecutionSubmission<Payload> }
  | {
      readonly status: "succeeded" | "failed";
      readonly submission: HcaExecutionSubmission<Payload>;
      readonly receipts: readonly TransactionReceipt[];
    };

/** Runtime adapters validate opaque payloads before invoking typed provider callbacks. */
export type HcaAdapterAction<Parameters, Success> = {
  invoke(
    config: EnsforgeConfig,
    parameters: Parameters,
    options?: Effect.RunOptions,
  ): Promise<Success>;
}["invoke"] & {
  effect(config: EnsforgeConfig, parameters: Parameters): Effect.Effect<Success, HcaError>;
};

/** Core remains independent of provider packages. */
export interface ExecutionAdapter<Prepared = unknown, Authorized = unknown, Submission = unknown> {
  readonly id: string;
  readonly instanceId: string;
  readonly capabilities?: HcaExecutionCapabilities;
  readonly supports: (plan: PreparedHcaCalls) => {
    readonly supported: boolean;
    readonly reason?: string;
  };
  readonly prepare: HcaAdapterAction<PreparedHcaCalls, PreparedHcaExecution<Prepared>>;
  readonly authorize: HcaAdapterAction<
    PreparedHcaExecution<Prepared>,
    AuthorizedHcaExecution<Authorized>
  >;
  readonly submit: HcaAdapterAction<
    AuthorizedHcaExecution<Authorized>,
    HcaAdapterSubmission<Submission>
  >;
  readonly getStatus: HcaAdapterAction<
    HcaAdapterSubmission<Submission>,
    HcaExecutionStatus<Submission>
  >;
}

export interface ExecuteHcaCallsParameters extends PrepareHcaCallsParameters {
  readonly execution?: ExecutionAdapter;
}

export interface HcaExecutionStatusParameters {
  readonly submission: HcaExecutionSubmission;
  readonly execution?: ExecutionAdapter;
}

export interface WaitForHcaExecutionParameters extends HcaExecutionStatusParameters {
  readonly confirmations?: number;
  readonly timeout?: number;
  readonly pollingInterval?: number;
  readonly maxPollingInterval?: number;
}
