import { Schema } from "effect";

import type { Account, Address, WalletClient } from "viem";

import type { EnsAction } from "../../action/action.js";
import type { BlockParameters } from "../../action/block.js";
import type { EnsWriteIntent } from "../../action/write-intent.js";
import type { CodecError } from "../../errors/codec-error.js";
import type { ContractError } from "../../errors/contract-error.js";
import type { NameError } from "../../errors/name-error.js";
import type { RpcError } from "../../errors/rpc-error.js";
import { Bytes32 } from "../../schemas/hash.js";
import type { Hex } from "../../schemas/hex.js";
import { EthereumAddress } from "../../schemas/identity.js";
import { NormalizedName } from "../../schemas/name.js";
import { EnsProtocol } from "../../schemas/protocol.js";
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

export type RegistrationReadError = CodecError | ContractError | NameError | RpcError;

export type RegistrationNameParameters = {
  readonly name: string;
  readonly duration: bigint;
} & BlockParameters;

export type RegistrationPriceParameters = RegistrationNameParameters & {
  readonly paymentToken?: EthereumAddress;
};

export const NativePaymentCurrency = Schema.Struct({
  kind: Schema.Literal("native"),
  symbol: Schema.Literal("ETH"),
  decimals: Schema.Literal(18),
});

export const Erc20PaymentCurrency = Schema.Struct({
  kind: Schema.Literal("erc20"),
  address: EthereumAddress,
  symbol: Schema.String,
  decimals: Schema.Int,
});

export const PaymentCurrency = Schema.Union([NativePaymentCurrency, Erc20PaymentCurrency]);
export type PaymentCurrency = typeof PaymentCurrency.Type;

const PaymentTokenRequired = Schema.Struct({
  status: Schema.Literal("payment-token-required"),
  name: NormalizedName,
  protocol: EnsProtocol,
});

const UnsupportedPaymentToken = Schema.Struct({
  status: Schema.Literal("unsupported-payment-token"),
  name: NormalizedName,
  protocol: EnsProtocol,
  paymentToken: EthereumAddress,
});

export const RegistrationPriceResult = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("available"),
    name: NormalizedName,
    protocol: EnsProtocol,
    registrar: EthereumAddress,
    duration: Schema.BigInt,
    base: Schema.BigInt,
    premium: Schema.BigInt,
    total: Schema.BigInt,
    currency: PaymentCurrency,
  }),
  Schema.Struct({
    status: Schema.Literal("unavailable"),
    name: NormalizedName,
    protocol: EnsProtocol,
    reason: Schema.Literal("NAME_UNAVAILABLE"),
  }),
  PaymentTokenRequired,
  UnsupportedPaymentToken,
]);
export type RegistrationPriceResult = typeof RegistrationPriceResult.Type;

export const RenewalRoute = Schema.Literals(["v1-controller", "v2-registrar", "v1-renewer"]);
export type RenewalRoute = typeof RenewalRoute.Type;

export const RenewalPriceResult = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("renewable"),
    name: NormalizedName,
    protocol: EnsProtocol,
    route: RenewalRoute,
    renewer: EthereumAddress,
    duration: Schema.BigInt,
    price: Schema.BigInt,
    currency: PaymentCurrency,
  }),
  Schema.Struct({
    status: Schema.Literal("not-renewable"),
    name: NormalizedName,
    protocol: EnsProtocol,
    reason: Schema.Literal("NAME_NOT_RENEWABLE"),
  }),
  PaymentTokenRequired,
  UnsupportedPaymentToken,
]);
export type RenewalPriceResult = typeof RenewalPriceResult.Type;

export const RegistrationParameters = Schema.Union([
  Schema.Struct({
    protocol: Schema.Literal("v1"),
    registrar: EthereumAddress,
    priceOracle: EthereumAddress,
    minimumRegistrationDuration: Schema.BigInt,
    minimumRenewalDuration: Schema.BigInt,
    minimumCommitmentAge: Schema.BigInt,
    maximumCommitmentAge: Schema.BigInt,
    payment: Schema.Struct({ kind: Schema.Literal("native") }),
  }),
  Schema.Struct({
    protocol: Schema.Literal("v2"),
    registrar: EthereumAddress,
    priceOracle: EthereumAddress,
    minimumRegistrationDuration: Schema.BigInt,
    minimumRenewalDuration: Schema.BigInt,
    minimumCommitmentAge: Schema.BigInt,
    maximumCommitmentAge: Schema.BigInt,
    payment: Schema.Struct({ kind: Schema.Literal("erc20"), enumerable: Schema.Literal(false) }),
  }),
]);
export type RegistrationParameters = typeof RegistrationParameters.Type;

export const PaymentTokenSupport = Schema.Union([
  Schema.Struct({
    protocol: Schema.Literal("v1"),
    supported: Schema.Literal(false),
    reason: Schema.Literal("NATIVE_PAYMENT_ONLY"),
  }),
  Schema.Struct({
    protocol: Schema.Literal("v2"),
    supported: Schema.Literal(false),
    token: EthereumAddress,
    reason: Schema.Literal("PAYMENT_TOKEN_NOT_SUPPORTED"),
  }),
  Schema.Struct({
    protocol: Schema.Literal("v2"),
    supported: Schema.Literal(true),
    token: EthereumAddress,
    symbol: Schema.String,
    decimals: Schema.Int,
  }),
]);
export type PaymentTokenSupport = typeof PaymentTokenSupport.Type;

export type RegistrationCommitmentParameters = RegistrationNameParameters & {
  readonly owner: EthereumAddress;
  readonly secret: Bytes32;
  readonly resolver?: EthereumAddress;
  readonly subregistry?: EthereumAddress;
  readonly records?: ReadonlyArray<Hex>;
  readonly reverseRecord?: 0 | 1 | 2;
  readonly referrer?: Bytes32;
};

export const RegistrationCommitment = Schema.Struct({
  name: NormalizedName,
  protocol: EnsProtocol,
  registrar: EthereumAddress,
  commitment: Bytes32,
});
export type RegistrationCommitment = typeof RegistrationCommitment.Type;

export const CommitmentStatus = Schema.Union([
  Schema.Struct({ status: Schema.Literal("not-found"), protocol: EnsProtocol }),
  Schema.Struct({
    status: Schema.Literal("pending"),
    protocol: EnsProtocol,
    submittedAt: Schema.BigInt,
    readyAt: Schema.BigInt,
    expiresAt: Schema.BigInt,
    remainingSeconds: Schema.BigInt,
  }),
  Schema.Struct({
    status: Schema.Literal("ready"),
    protocol: EnsProtocol,
    submittedAt: Schema.BigInt,
    readyAt: Schema.BigInt,
    expiresAt: Schema.BigInt,
    remainingSeconds: Schema.BigInt,
  }),
  Schema.Struct({
    status: Schema.Literal("expired"),
    protocol: EnsProtocol,
    submittedAt: Schema.BigInt,
    readyAt: Schema.BigInt,
    expiresAt: Schema.BigInt,
  }),
]);
export type CommitmentStatus = typeof CommitmentStatus.Type;

export const RegistrationPlan = Schema.Union([
  Schema.Struct({ status: Schema.Literal("unavailable"), name: NormalizedName }),
  Schema.Struct({ status: Schema.Literal("payment-token-required"), name: NormalizedName }),
  Schema.Struct({
    status: Schema.Literal("unsupported-payment-token"),
    name: NormalizedName,
    paymentToken: EthereumAddress,
  }),
  Schema.Struct({
    status: Schema.Literals([
      "commitment-required",
      "commitment-pending",
      "ready",
      "commitment-expired",
    ]),
    name: NormalizedName,
    parameters: RegistrationParameters,
    price: RegistrationPriceResult,
    commitment: RegistrationCommitment,
    commitmentStatus: CommitmentStatus,
  }),
]);
export type RegistrationPlan = typeof RegistrationPlan.Type;

export interface CommitNameParameters {
  readonly commitment: Bytes32;
}

export interface ApprovePaymentTokenParameters {
  readonly paymentToken: string;
  readonly amount: bigint;
}

type RegistrationCommitmentWriteParameters = Omit<
  RegistrationCommitmentParameters,
  "blockNumber" | "blockTag"
>;

export type CompleteRegistrationParameters = RegistrationCommitmentWriteParameters & {
  readonly paymentToken?: EthereumAddress;
  readonly maxPrice?: bigint;
};

export interface RegistrationWalletParameters {
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly mode?: WriteMode;
  readonly confirmation?: ConfirmationPolicy;
}

type RegisterNameParametersState = Omit<RegistrationCommitmentWriteParameters, "records"> &
  RegistrationWalletParameters & {
    readonly paymentToken?: EthereumAddress;
    readonly maxPrice?: bigint;
    readonly records?: ReadonlyArray<SetRecordInput>;
    readonly resume?: RegisterNameResult;
  };

export type AvailableRegistrationPrice = Extract<RegistrationPriceResult, { status: "available" }>;

export interface RegisterNameResult extends WorkflowProgress {
  readonly status: "waiting" | "partial" | "submitted" | "completed";
  readonly name: NormalizedName;
  readonly protocol: typeof EnsProtocol.Type;
  readonly commitment: Bytes32;
  readonly committedByWorkflow: boolean;
  readonly paymentApprovalIncluded: boolean;
  readonly readyAt: bigint | null;
  readonly expiresAt: bigint | null;
  readonly nextActionAt: bigint | null;
  readonly price: AvailableRegistrationPrice;
  readonly write: WritePlanProgress;
  readonly finalState: NameState | null;
}

export type RegisterNamesEntryParameters = Omit<
  RegisterNameParameters,
  "resume" | "walletClient" | "account" | "mode" | "confirmation"
>;

export interface RegisterNamesParameters extends WorkflowParameters, RegistrationWalletParameters {
  readonly registrations: ReadonlyArray<RegisterNamesEntryParameters>;
  readonly resume?: RegisterNamesResult;
}

export interface RegisterNamesResult extends WorkflowProgress {
  readonly status: "waiting" | "partial" | "submitted" | "completed";
  readonly registrations: ReadonlyArray<RegisterNameResult>;
  readonly nextActionAt: bigint | null;
}

export type RegistrationWriteError = WriteError;

export type RegistrationWriteResult = CallExecutionResult;

export type RegistrationWriteIntent = EnsWriteIntent<
  RegistrationWriteResult,
  RegistrationWriteError
>;

export type RenewNameCallParameters = {
  readonly name: string;
  readonly duration: bigint;
  readonly paymentToken?: EthereumAddress;
  readonly maxPrice?: bigint;
  readonly referrer?: Bytes32;
};

export interface ApproveRenewalPaymentParameters {
  readonly name: string;
  readonly duration: bigint;
  readonly paymentToken: string;
  readonly amount: bigint;
}

type RenewNameParametersState = RenewNameCallParameters &
  RegistrationWalletParameters & {
    readonly resume?: RenewNameResult;
  };

export interface RenewalApproval {
  readonly required: boolean;
  readonly spender: EthereumAddress | null;
  readonly token: EthereumAddress | null;
  readonly amount: bigint;
}

export interface RenewNameResult extends WorkflowProgress {
  readonly status: "completed" | "partial";
  readonly name: NormalizedName;
  readonly protocol: typeof EnsProtocol.Type;
  readonly route: RenewalRoute;
  readonly duration: bigint;
  readonly previousExpiry: bigint | null;
  readonly newExpiry: bigint | null;
  readonly price: bigint;
  readonly currency: PaymentCurrency;
  readonly approval: RenewalApproval;
  readonly write: WritePlanProgress;
  readonly finalState: NameState | null;
}

export interface RenewNameAction extends EnsAction<
  RenewNameParameters,
  RenewNameResult,
  WriteError
> {
  readonly call: (
    parameters: RenewNameCallParameters,
  ) => EnsWriteIntent<CallExecutionResult, WriteError>;
}

export type RenewNamesEntryParameters = RenewNameCallParameters;

export interface RenewNamesParameters extends WorkflowParameters, RegistrationWalletParameters {
  readonly renewals: ReadonlyArray<RenewNamesEntryParameters>;
  readonly maxTotalPrice?: bigint;
  readonly resume?: RenewNamesResult;
}

export interface RenewNamesResult extends WorkflowProgress {
  readonly status: "completed" | "partial";
  readonly renewals: ReadonlyArray<
    Omit<RenewNameResult, "write" | "status" | "approval" | "finalState"> & {
      readonly newExpiry: bigint | null;
      readonly finalState: NameState | null;
    }
  >;
  readonly approvals: ReadonlyArray<RenewalApproval>;
  readonly totalPrice: bigint;
  readonly write: WritePlanProgress;
}

export type RegisterNameParameters = RegisterNameParametersState & WorkflowParameters;

export type RenewNameParameters = RenewNameParametersState & WorkflowParameters;
