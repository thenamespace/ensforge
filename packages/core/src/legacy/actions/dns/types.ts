import { Schema } from "effect";

import type { Account, Address, WalletClient } from "viem";

import type { BlockParameters } from "../../action/block.js";
import type { EnsWriteIntent } from "../../action/write-intent.js";
import type { CodecError } from "../../errors/codec-error.js";
import type { ContractError } from "../../errors/contract-error.js";
import type { NameError } from "../../errors/name-error.js";
import type { RpcError } from "../../errors/rpc-error.js";
import { DnsEncodedName } from "../../schemas/dns.js";
import { Hex } from "../../schemas/hex.js";
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

export type DnsReadError = CodecError | ContractError | NameError | RpcError;

export const DnssecProof = Schema.Struct({
  rrset: Hex,
  sig: Hex,
});
export type DnssecProof = typeof DnssecProof.Type;

export const DnssecProofChain = Schema.Array(DnssecProof).pipe(
  Schema.check(Schema.isMinLength(1, { message: "Expected at least one signed DNS RRSET" })),
);
export type DnssecProofChain = typeof DnssecProofChain.Type;

export interface DnsWriteWalletParameters {
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly mode?: WriteMode;
  readonly confirmation?: ConfirmationPolicy;
}

export interface ClaimDnsNameParameters {
  readonly name: string;
  readonly proof: ReadonlyArray<DnssecProof>;
  readonly resolver?: string;
  readonly address?: string;
}

export type ClaimDnsNameResult = CallExecutionResult;

export type ClaimDnsNameError = WriteError;

export type ClaimDnsNameIntent = EnsWriteIntent<ClaimDnsNameResult, ClaimDnsNameError>;

type ImportDnsNameParametersState = ClaimDnsNameParameters &
  DnsWriteWalletParameters & {
    readonly resume?: ImportDnsNameResult;
  };

type ImportDnsNameResultState =
  | {
      readonly status: "completed" | "not-required";
      readonly name: NormalizedName;
      readonly owner: EthereumAddress;
      readonly resolver: EthereumAddress | null;
      readonly write: WritePlanProgress | null;
    }
  | {
      readonly status: "partial";
      readonly name: NormalizedName;
      readonly owner: null;
      readonly resolver: null;
      readonly write: WritePlanProgress;
    };

export type ImportDnsNameError = WriteError;

export const DnsResource = Schema.Int.pipe(
  Schema.check(
    Schema.isBetween(
      { minimum: 0, maximum: 65_535 },
      { message: "Expected a uint16 DNS resource" },
    ),
  ),
);
export type DnsResource = typeof DnsResource.Type;

export type DnsRecordQuery = { readonly recordName: string; readonly resource: DnsResource };

export type GetDnsRecordParameters = {
  readonly name: string;
  readonly recordName: string;
  readonly resource: DnsResource;
} & BlockParameters;

export const DnsRecordResult = Schema.Struct({
  name: NormalizedName,
  recordName: NormalizedName,
  resource: DnsResource,
  resolver: Schema.NullOr(EthereumAddress),
  value: Schema.NullOr(Hex),
});
export type DnsRecordResult = typeof DnsRecordResult.Type;

export type GetDnsRecordsParameters = {
  readonly name: string;
  readonly records: ReadonlyArray<DnsRecordQuery>;
} & BlockParameters;

export const DnsRecordsResult = Schema.Struct({
  name: NormalizedName,
  resolver: Schema.NullOr(EthereumAddress),
  records: Schema.Array(DnsRecordResult),
});
export type DnsRecordsResult = typeof DnsRecordsResult.Type;

export const DnsRecordsExistence = Schema.Struct({
  name: NormalizedName,
  recordName: NormalizedName,
  resolver: Schema.NullOr(EthereumAddress),
  exists: Schema.Boolean,
});
export type DnsRecordsExistence = typeof DnsRecordsExistence.Type;

export const ZoneHashResult = Schema.Struct({
  name: NormalizedName,
  resolver: Schema.NullOr(EthereumAddress),
  value: Schema.NullOr(Hex),
});
export type ZoneHashResult = typeof ZoneHashResult.Type;

export const DnsClaimStatus = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("unsupported"),
    name: NormalizedName,
    reason: Schema.Literal("DNS_REGISTRAR_UNAVAILABLE"),
  }),
  Schema.Struct({
    status: Schema.Literal("claimed"),
    name: NormalizedName,
    owner: EthereumAddress,
    resolver: Schema.NullOr(EthereumAddress),
    previousInception: Schema.BigInt,
  }),
  Schema.Struct({
    status: Schema.Literal("proof-required"),
    name: NormalizedName,
    previousInception: Schema.BigInt,
  }),
]);
export type DnsClaimStatus = typeof DnsClaimStatus.Type;

export const DnsImportPlan = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("unsupported"),
    name: NormalizedName,
    reason: Schema.Literal("DNS_REGISTRAR_UNAVAILABLE"),
  }),
  Schema.Struct({
    status: Schema.Literal("already-claimed"),
    name: NormalizedName,
    registrar: EthereumAddress,
    oracle: EthereumAddress,
    owner: EthereumAddress,
    resolver: Schema.NullOr(EthereumAddress),
  }),
  Schema.Struct({
    status: Schema.Literal("proof-required"),
    name: NormalizedName,
    registrar: EthereumAddress,
    oracle: EthereumAddress,
    proofRequest: Schema.Struct({
      name: DnsEncodedName,
      previousInception: Schema.BigInt,
    }),
  }),
]);
export type DnsImportPlan = typeof DnsImportPlan.Type;

export type ImportDnsNameParameters = ImportDnsNameParametersState & WorkflowParameters;

export type ImportDnsNameResult = ImportDnsNameResultState & WorkflowProgress;
