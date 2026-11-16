import { Schema } from "effect";

import { EthereumAddress, type EnsAction, type HcaError } from "@ensforge/core/legacy";
import { HcaExecutionHash, HcaSalt, type HcaStorage } from "@ensforge/core/legacy/hca";
import type { SettlementLayer } from "@rhinestone/sdk";
import type { Account, Address, Chain, Hex, PublicClient } from "viem";

const address = EthereumAddress;
const amount = HcaSalt;
const positive = Schema.Int.check(Schema.isGreaterThan(0));

export interface RhinestoneFundingContract {
  readonly address: Address;
  readonly codeHash: Hex;
  /** Pin proxy implementation slots as well as the implementation's bytecode. */
  readonly storageSlots?: readonly { readonly slot: Hex; readonly value: Hex }[];
}

/** An independently reviewed route, never populated from an untrusted quote. */
export interface RhinestoneFundingRoute {
  readonly id: string;
  readonly provenance: string;
  readonly sourceChainId: number;
  readonly destinationChainId: number;
  readonly sourceToken: Address;
  readonly destinationToken: Address;
  readonly settlementLayer: Exclude<SettlementLayer, "SAME_CHAIN" | "INTENT_EXECUTOR">;
  readonly arbiter: Address;
  readonly destinationSettlement: Address;
  /** Exact qualifier bytes for this deployment/route. Dynamic qualifiers need a separate review. */
  readonly qualifier: Hex;
  readonly sourceContracts: readonly RhinestoneFundingContract[];
  readonly destinationContracts: readonly RhinestoneFundingContract[];
}

export interface RhinestoneCrossChainOptions {
  readonly routes: readonly RhinestoneFundingRoute[];
  readonly sourceClients: Readonly<Record<number, PublicClient>>;
  readonly maximumQuoteLifetimeSeconds?: number;
  readonly confirmations?: number;
}

export interface RhinestoneFundingSource {
  readonly chain: Chain;
  /** Plain EOA with signTypedData; no delegation, account deployment or source session. */
  readonly account: Account;
  readonly publicClient: PublicClient;
}

export interface QuoteRhinestoneFundingParameters {
  readonly id: string;
  readonly routeId: string;
  readonly source: RhinestoneFundingSource;
  readonly destinationHca: Address;
  readonly salt?: bigint;
  readonly amount: bigint;
  /** Total source ERC-20 debit, including unsponsored provider fees. */
  readonly maximumSourceSpend: bigint;
  readonly sponsored?: boolean;
}

export const RhinestoneFundingRecord = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.NonEmptyString,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  configurationFingerprint: HcaExecutionHash,
  routeId: Schema.NonEmptyString,
  sourceChainId: positive,
  destinationChainId: positive,
  sourceAccount: address,
  destinationHca: address,
  salt: amount,
  sourceToken: address,
  destinationToken: address,
  amount,
  maximumSourceSpend: amount,
  sourceSpend: amount,
  permitNonce: amount,
  scopeHash: HcaExecutionHash,
  expiresAt: amount,
  fillDeadline: amount,
  createdAt: amount,
  sourceStartBlock: amount,
  destinationStartBlock: amount,
  state: Schema.Literals(["authorizing", "submitting", "submitted", "cancelled"]),
  intentId: Schema.optional(Schema.String.check(Schema.isPattern(/^(0|[1-9][0-9]*)$/))),
});

export type RhinestoneFundingRecord = typeof RhinestoneFundingRecord.Type;

export interface RhinestoneFundingCall {
  readonly chainId: number;
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

export interface RhinestoneFundingQuote {
  readonly record: RhinestoneFundingRecord;
  /** Exact ERC-20 allowance required by Permit2. The caller sends and confirms these calls. */
  readonly approvals: readonly RhinestoneFundingCall[];
}

export interface RhinestoneFundingReference {
  readonly id: string;
  readonly storage?: HcaStorage;
}

export interface RhinestoneFundingStatus {
  readonly record: RhinestoneFundingRecord;
  readonly status: "pending" | "funded" | "unknown" | "cancelled";
  readonly providerStatus?: string;
  readonly destination: {
    readonly status: "pending" | "confirmed" | "reverted";
    readonly hash?: Hex;
  };
  readonly claims: readonly {
    readonly chainId: number;
    readonly hash?: Hex;
    readonly status: "pending" | "confirmed" | "reverted";
  }[];
  /** Funds currently available for the next ENS action, independently of provider status. */
  readonly destinationBalance: bigint;
}

export interface RhinestoneCrossChain {
  readonly quoteFunding: EnsAction<
    QuoteRhinestoneFundingParameters,
    RhinestoneFundingQuote,
    HcaError
  >;
  readonly fund: EnsAction<
    { readonly quote: RhinestoneFundingQuote; readonly storage?: HcaStorage },
    RhinestoneFundingRecord,
    HcaError
  >;
  readonly getFundingStatus: EnsAction<
    RhinestoneFundingReference,
    RhinestoneFundingStatus,
    HcaError
  >;
  readonly waitForFunding: EnsAction<
    RhinestoneFundingReference & {
      readonly timeoutMs?: number;
      readonly pollingIntervalMs?: number;
    },
    RhinestoneFundingStatus,
    HcaError
  >;
  /** Only cancels local authorization before the durable submission claim. */
  readonly cancelFunding: EnsAction<RhinestoneFundingReference, RhinestoneFundingRecord, HcaError>;
  /** Attach a provider identifier recovered from its dashboard; never resubmits. */
  readonly recoverFunding: EnsAction<
    RhinestoneFundingReference & { readonly intentId: string },
    RhinestoneFundingRecord,
    HcaError
  >;
  /** Explicit source nonce invalidation and allowance reset; the caller sends these transactions. */
  readonly getFundingCleanup: EnsAction<
    RhinestoneFundingReference,
    readonly RhinestoneFundingCall[],
    HcaError
  >;
}
