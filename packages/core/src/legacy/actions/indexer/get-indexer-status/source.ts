import { Effect, Schema } from "effect";

import type { EnsforgeConfig } from "../../../config/config.js";
import { getIndexerRuntimeConfig, type IndexerProtocol } from "../../../config/indexer-options.js";
import type { IndexerConfigError } from "../../../errors/indexer-config-error.js";
import { IndexerDecodeError } from "../../../errors/indexer-decode-error.js";
import { IndexerRequestError } from "../../../errors/indexer-request-error.js";
import { IndexerResponseError } from "../../../errors/indexer-response-error.js";
import type { IndexerUnavailableError } from "../../../errors/indexer-unavailable-error.js";
import { requestIndexer } from "../../../internal/indexer/client.js";
import {
  V1IndexerStatusDocument,
  type V1IndexerStatusQuery,
  type V1IndexerStatusQueryVariables,
} from "../../../internal/indexer/generated/v1/status.js";
import {
  V2IndexerStatusDocument,
  type V2IndexerStatusQuery,
  type V2IndexerStatusQueryVariables,
} from "../../../internal/indexer/generated/v2/status.js";
import {
  ReadyIndexerSourceStatus,
  type IndexerSourceFailure,
  type IndexerSourceStatus,
} from "./types.js";

type StatusWireResult = V1IndexerStatusQuery | V2IndexerStatusQuery;

type SourceError =
  | IndexerConfigError
  | IndexerDecodeError
  | IndexerRequestError
  | IndexerResponseError
  | IndexerUnavailableError;

const safeFailure = (error: SourceError): IndexerSourceFailure => ({
  code: error.code,
  message: error.message,
  retryable: error instanceof IndexerRequestError && error.retryable,
  ...(error instanceof IndexerRequestError && error.status !== undefined
    ? { httpStatus: error.status }
    : {}),
});

const queryStatus = (
  config: EnsforgeConfig,
  protocol: IndexerProtocol,
): Effect.Effect<StatusWireResult, SourceError> =>
  Effect.gen(function* () {
    const response =
      protocol === "v1"
        ? yield* requestIndexer<V1IndexerStatusQuery, V1IndexerStatusQueryVariables>(config, {
            protocol,
            operationName: "V1IndexerStatus",
            document: V1IndexerStatusDocument,
          })
        : yield* requestIndexer<V2IndexerStatusQuery, V2IndexerStatusQueryVariables>(config, {
            protocol,
            operationName: "V2IndexerStatus",
            document: V2IndexerStatusDocument,
          });

    if (response.errors.length > 0) {
      return yield* new IndexerResponseError({
        code: "GRAPHQL_FAILED",
        message: `The ${config.network}:${protocol} indexer returned GraphQL errors`,
        network: config.network,
        protocol,
        operationName: protocol === "v1" ? "V1IndexerStatus" : "V2IndexerStatus",
        errors: [...response.errors],
        ...(response.data === undefined ? {} : { data: response.data }),
      });
    }

    if (response.data === undefined) {
      return yield* new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${config.network}:${protocol} indexer returned no status data`,
        network: config.network,
        protocol,
        operationName: protocol === "v1" ? "V1IndexerStatus" : "V2IndexerStatus",
        cause: response,
      });
    }

    return response.data;
  });

export const getIndexerSourceStatus = Effect.fn("getIndexerSourceStatus")(function* (
  config: EnsforgeConfig,
  protocol: IndexerProtocol,
): Effect.fn.Return<IndexerSourceStatus> {
  const sourceState = getIndexerRuntimeConfig(config.indexer).sourceStates[protocol];

  if (sourceState !== "enabled") return { protocol, status: sourceState };

  return yield* queryStatus(config, protocol).pipe(
    Effect.flatMap((result) => {
      const meta = result["_meta"];

      if (meta === null) {
        return new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: `The ${config.network}:${protocol} indexer returned empty metadata`,
          network: config.network,
          protocol,
          operationName: protocol === "v1" ? "V1IndexerStatus" : "V2IndexerStatus",
          cause: result,
        });
      }

      return Effect.try({
        try: () =>
          Schema.decodeUnknownSync(ReadyIndexerSourceStatus)({
            protocol,
            status: "ready",
            health: meta.hasIndexingErrors ? "indexing-errors" : "healthy",
            indexedBlock: {
              number: BigInt(meta.block.number),
              hash: meta.block.hash,
              timestamp: meta.block.timestamp === null ? null : BigInt(meta.block.timestamp),
            },
            deployment: meta.deployment,
          }),
        catch: (cause) =>
          new IndexerDecodeError({
            code: "INVALID_RESPONSE",
            message: `The ${config.network}:${protocol} indexer returned invalid status metadata`,
            network: config.network,
            protocol,
            operationName: protocol === "v1" ? "V1IndexerStatus" : "V2IndexerStatus",
            cause,
          }),
      });
    }),
    Effect.catch((error) =>
      Effect.succeed({ protocol, status: "failed" as const, failure: safeFailure(error) }),
    ),
  );
});
