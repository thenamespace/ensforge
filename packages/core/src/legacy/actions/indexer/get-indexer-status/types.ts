import { Schema } from "effect";

import { EnsNetworkIdSchema } from "../../../config/network.js";
import { Hex } from "../../../schemas/hex.js";

export const IndexerBlock = Schema.Struct({
  number: Schema.BigInt,
  hash: Schema.NullOr(Hex),
  timestamp: Schema.NullOr(Schema.BigInt),
});
export type IndexerBlock = typeof IndexerBlock.Type;

export const IndexerSourceFailure = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  retryable: Schema.Boolean,
  httpStatus: Schema.optional(Schema.Int),
});
export type IndexerSourceFailure = typeof IndexerSourceFailure.Type;

const IndexerSourceIdentity = {
  protocol: Schema.Literals(["v1", "v2"]),
};

export const ReadyIndexerSourceStatus = Schema.Struct({
  ...IndexerSourceIdentity,
  status: Schema.Literal("ready"),
  health: Schema.Literals(["healthy", "indexing-errors"]),
  indexedBlock: IndexerBlock,
  deployment: Schema.NullOr(Schema.String),
});

export const FailedIndexerSourceStatus = Schema.Struct({
  ...IndexerSourceIdentity,
  status: Schema.Literal("failed"),
  failure: IndexerSourceFailure,
});

export const DisabledIndexerSourceStatus = Schema.Struct({
  ...IndexerSourceIdentity,
  status: Schema.Literal("disabled"),
});

export const UnavailableIndexerSourceStatus = Schema.Struct({
  ...IndexerSourceIdentity,
  status: Schema.Literal("unavailable"),
});

export const IndexerSourceStatus = Schema.Union([
  ReadyIndexerSourceStatus,
  FailedIndexerSourceStatus,
  DisabledIndexerSourceStatus,
  UnavailableIndexerSourceStatus,
]);
export type IndexerSourceStatus = typeof IndexerSourceStatus.Type;

export const IndexerStatus = Schema.Struct({
  network: EnsNetworkIdSchema,
  sources: Schema.Array(IndexerSourceStatus),
});
export type IndexerStatus = typeof IndexerStatus.Type;
