import { Effect } from "effect";

import type { IndexerSourceFailure } from "../../actions/indexer/get-indexer-status/types.js";
import type { EnsforgeConfig } from "../../config/config.js";
import type { IndexerProtocol } from "../../config/indexer-options.js";
import { IndexerDecodeError } from "../../errors/indexer-decode-error.js";
import { IndexerRequestError } from "../../errors/indexer-request-error.js";
import { IndexerResponseError } from "../../errors/indexer-response-error.js";
import type { IndexerTransportResult } from "./client.js";

interface IndexerMetadataWire {
  readonly _meta: { readonly block: { readonly number: number | string } } | null;
}

type CompleteIndexerData<Result extends IndexerMetadataWire> = Result & {
  readonly _meta: NonNullable<Result["_meta"]>;
};

export const requireIndexerData = Effect.fn("requireIndexerData")(function* <
  Result extends IndexerMetadataWire,
>(
  config: EnsforgeConfig,
  protocol: IndexerProtocol,
  operationName: string,
  response: IndexerTransportResult<Result>,
): Effect.fn.Return<CompleteIndexerData<Result>, IndexerResponseError | IndexerDecodeError> {
  if (response.errors.length > 0) {
    return yield* new IndexerResponseError({
      code: "GRAPHQL_FAILED",
      message: `The ${config.network}:${protocol} indexer returned GraphQL errors`,
      network: config.network,
      protocol,
      operationName,
      errors: [...response.errors],
      ...(response.data === undefined ? {} : { data: response.data }),
    });
  }

  if (response.data === undefined || response.data["_meta"] === null) {
    return yield* new IndexerDecodeError({
      code: "INVALID_RESPONSE",
      message: `The ${config.network}:${protocol} indexer returned incomplete data`,
      network: config.network,
      protocol,
      operationName,
      cause: response,
    });
  }

  return response.data as CompleteIndexerData<Result>;
});

export const decodeIndexedBlock = Effect.fn("decodeIndexedBlock")(function* (
  config: EnsforgeConfig,
  protocol: IndexerProtocol,
  operationName: string,
  value: number | string,
): Effect.fn.Return<bigint, IndexerDecodeError> {
  return yield* Effect.try({
    try: () => BigInt(value),
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${config.network}:${protocol} indexer returned an invalid indexed block`,
        network: config.network,
        protocol,
        operationName,
        cause,
      }),
  });
});

export const indexerSourceFailure = (error: {
  readonly code: string;
  readonly message: string;
}): IndexerSourceFailure => ({
  code: error.code,
  message: error.message,
  retryable: error instanceof IndexerRequestError && error.retryable,
  ...(error instanceof IndexerRequestError && error.status !== undefined
    ? { httpStatus: error.status }
    : {}),
});
