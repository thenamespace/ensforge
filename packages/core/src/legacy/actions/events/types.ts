import { Schema } from "effect";

import type { ContractError } from "../../errors/contract-error.js";
import type { NameError } from "../../errors/name-error.js";
import type { RpcError } from "../../errors/rpc-error.js";
import { Bytes32 } from "../../schemas/hash.js";
import { Hex } from "../../schemas/hex.js";
import { EthereumAddress } from "../../schemas/identity.js";
import { NormalizedName } from "../../schemas/name.js";
import { EnsProtocol } from "../../schemas/protocol.js";

export type EnsEventError = ContractError | NameError | RpcError;

export const EnsEventKind = Schema.Literals([
  "commitment",
  "registration",
  "renewal",
  "ownership",
  "manager",
  "resolver",
  "records",
  "subname",
  "migration",
  "other",
]);
export type EnsEventKind = typeof EnsEventKind.Type;

export const EnsEventContractKind = Schema.Literals([
  "registrar",
  "registry",
  "name-wrapper",
  "resolver",
  "migration-controller",
]);
export type EnsEventContractKind = typeof EnsEventContractKind.Type;

export const EnsEvent = Schema.Struct({
  kind: EnsEventKind,
  protocol: EnsProtocol,
  contractKind: EnsEventContractKind,
  eventName: Schema.String,
  contract: EthereumAddress,
  blockNumber: Schema.NullOr(Schema.BigInt),
  transactionHash: Schema.NullOr(Hex),
  transactionIndex: Schema.NullOr(Schema.Int),
  logIndex: Schema.NullOr(Schema.Int),
  removed: Schema.Boolean,
  name: Schema.optional(NormalizedName),
  label: Schema.optional(Schema.String),
  node: Schema.optional(Bytes32),
  owner: Schema.optional(EthereumAddress),
  from: Schema.optional(EthereumAddress),
  to: Schema.optional(EthereumAddress),
  resolver: Schema.optional(EthereumAddress),
  tokenId: Schema.optional(Schema.BigInt),
  commitment: Schema.optional(Bytes32),
  raw: Schema.Struct({
    topics: Schema.Array(Hex),
    data: Hex,
    args: Schema.Unknown,
  }),
});
export type EnsEvent = typeof EnsEvent.Type;

export type GetEnsEventsParameters = {
  readonly fromBlock: bigint;
  readonly toBlock?: bigint;
  readonly kinds?: ReadonlyArray<EnsEventKind>;
  readonly name?: string;
  readonly account?: EthereumAddress;
  readonly commitment?: Bytes32;
};

export type WatchEnsEventsParameters = Omit<GetEnsEventsParameters, "fromBlock" | "toBlock"> & {
  readonly fromBlock?: bigint;
  readonly pollingInterval?: number;
};

export type GetNameHistoryParameters = {
  readonly name: string;
  readonly fromBlock: bigint;
  readonly toBlock?: bigint;
};

export const NameHistory = Schema.Struct({
  name: NormalizedName,
  events: Schema.Array(EnsEvent),
});
export type NameHistory = typeof NameHistory.Type;
