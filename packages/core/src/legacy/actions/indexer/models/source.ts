import { Schema } from "effect";

import { EnsNetworkIdSchema } from "../../../config/network.js";
import { IndexerSourceFailure } from "../get-indexer-status/types.js";

export const IndexedEntitySource = Schema.Struct({
  network: EnsNetworkIdSchema,
  protocol: Schema.Literals(["v1", "v2"]),
  indexedBlock: Schema.BigInt,
});
export type IndexedEntitySource = typeof IndexedEntitySource.Type;

export const CompleteIndexerSourcePageStatus = Schema.Struct({
  protocol: Schema.Literals(["v1", "v2"]),
  status: Schema.Literal("complete"),
  indexedBlock: Schema.BigInt,
  hasNextPage: Schema.Boolean,
});

export const FailedIndexerSourcePageStatus = Schema.Struct({
  protocol: Schema.Literals(["v1", "v2"]),
  status: Schema.Literal("failed"),
  failure: IndexerSourceFailure,
});

export const DisabledIndexerSourcePageStatus = Schema.Struct({
  protocol: Schema.Literals(["v1", "v2"]),
  status: Schema.Literal("disabled"),
});

export const UnavailableIndexerSourcePageStatus = Schema.Struct({
  protocol: Schema.Literals(["v1", "v2"]),
  status: Schema.Literal("unavailable"),
});

export const IndexerSourcePageStatus = Schema.Union([
  CompleteIndexerSourcePageStatus,
  FailedIndexerSourcePageStatus,
  DisabledIndexerSourcePageStatus,
  UnavailableIndexerSourcePageStatus,
]);
export type IndexerSourcePageStatus = typeof IndexerSourcePageStatus.Type;
