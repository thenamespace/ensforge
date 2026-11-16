import { Duration, Effect, Schema } from "effect";
import { FetchHttpClient, HttpBody, HttpClient, HttpClientRequest } from "effect/http";

import type { EnsforgeConfig } from "../../config/config.js";
import { getIndexerRuntimeConfig } from "../../config/indexer-options.js";
import { IndexerConfigError } from "../../errors/indexer-config-error.js";
import { IndexerDecodeError } from "../../errors/indexer-decode-error.js";
import { IndexerRequestError } from "../../errors/indexer-request-error.js";
import {
  IndexerGraphQLError,
  type IndexerGraphQLError as IndexerGraphQLErrorType,
} from "../../errors/indexer-response-error.js";
import type { IndexerUnavailableError } from "../../errors/indexer-unavailable-error.js";
import {
  indexerRequestErrorFromCause,
  IndexerRequestTimeoutCause,
  retryAfterMilliseconds,
} from "./error.js";
import { resolveIndexerSource, type IndexerSource } from "./source.js";

type IndexerVariables = object;

type IndexerRequestDocument = { readonly toString: () => string };

export interface IndexerRequestParameters<
  VariablesType extends IndexerVariables = Record<string, never>,
> {
  readonly protocol: "v1" | "v2";
  readonly operationName: string;
  readonly document: IndexerRequestDocument;
  readonly variables?: VariablesType;
}

export interface IndexerTransportResult<Result> {
  readonly data: Result | undefined;
  readonly errors: ReadonlyArray<IndexerGraphQLErrorType>;
  readonly status: number;
  readonly extensions?: unknown;
}

export type IndexerTransportError =
  | IndexerConfigError
  | IndexerUnavailableError
  | IndexerRequestError
  | IndexerDecodeError;

const IndexerResponseEnvelope = Schema.Struct({
  data: Schema.optional(Schema.Unknown),
  errors: Schema.optional(Schema.NullOr(Schema.Array(Schema.Unknown))),
  extensions: Schema.optional(Schema.Unknown),
});

const resolveHeaders = (
  config: EnsforgeConfig,
  source: IndexerSource,
): Effect.Effect<Readonly<Record<string, string>>, IndexerConfigError> => {
  const headers = getIndexerRuntimeConfig(config.indexer).headers;

  if (headers === undefined) return Effect.succeed({});

  if (typeof headers !== "function") return Effect.succeed({ ...headers });

  return Effect.tryPromise({
    try: () => Promise.resolve(headers({ network: source.network, protocol: source.protocol })),
    catch: (cause) =>
      new IndexerConfigError({
        code: "HEADERS_FAILED",
        message: `Unable to resolve headers for the ${source.identity} indexer`,
        cause,
      }),
  });
};

const normalizeErrors = (errors: ReadonlyArray<unknown> | undefined) =>
  (errors ?? []).filter(Schema.is(IndexerGraphQLError));

const requestOnce = <Result, VariablesType extends IndexerVariables>(
  config: EnsforgeConfig,
  source: IndexerSource,
  parameters: IndexerRequestParameters<VariablesType>,
  attempt: number,
): Effect.Effect<IndexerTransportResult<Result>, IndexerTransportError> =>
  Effect.gen(function* () {
    const headers = yield* resolveHeaders(config, source);
    const runtime = getIndexerRuntimeConfig(config.indexer);

    const body = yield* Effect.try({
      try: () =>
        JSON.stringify({
          query: String(parameters.document),
          ...(parameters.variables === undefined ? {} : { variables: parameters.variables }),
        }),
      catch: (cause) =>
        indexerRequestErrorFromCause(source, parameters.operationName, attempt, cause),
    });

    const request = HttpClientRequest.post(source.endpoint).pipe(
      HttpClientRequest.setHeaders(headers),
      HttpClientRequest.acceptJson,
      HttpClientRequest.setBody(HttpBody.raw(body, { contentType: "application/json" })),
    );

    const execute = Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      const response = yield* client
        .execute(request)
        .pipe(
          Effect.mapError((cause) =>
            indexerRequestErrorFromCause(source, parameters.operationName, attempt, cause),
          ),
        );

      if (response.status < 200 || response.status >= 300) {
        const retryAfter = retryAfterMilliseconds(response.headers);

        return yield* new IndexerRequestError({
          code: "HTTP_FAILED",
          message: `The ${source.identity} indexer request failed with HTTP ${response.status}`,
          network: source.network,
          protocol: source.protocol,
          operationName: parameters.operationName,
          attempt,
          retryable: [408, 429, 500, 502, 503, 504].includes(response.status),
          status: response.status,
          ...(retryAfter === undefined ? {} : { retryAfter }),
          cause: response,
        });
      }

      const json = yield* response.json.pipe(
        Effect.mapError(
          (cause) =>
            new IndexerDecodeError({
              code: "INVALID_RESPONSE",
              message: `The ${source.identity} indexer returned malformed JSON`,
              network: source.network,
              protocol: source.protocol,
              operationName: parameters.operationName,
              cause,
            }),
        ),
      );

      const envelope = yield* Schema.decodeUnknownEffect(IndexerResponseEnvelope)(json).pipe(
        Effect.mapError(
          (cause) =>
            new IndexerDecodeError({
              code: "INVALID_RESPONSE",
              message: `The ${source.identity} indexer returned an invalid GraphQL response`,
              network: source.network,
              protocol: source.protocol,
              operationName: parameters.operationName,
              cause,
            }),
        ),
      );

      return {
        data: envelope.data as Result | undefined,
        errors: normalizeErrors(envelope.errors ?? undefined),
        status: response.status,
        ...(envelope.extensions === undefined ? {} : { extensions: envelope.extensions }),
      };
    }).pipe(Effect.provide(FetchHttpClient.layer));

    const withFetch =
      runtime.fetch === undefined
        ? execute
        : execute.pipe(Effect.provideService(FetchHttpClient.Fetch, runtime.fetch));

    return yield* withFetch.pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(config.indexer.timeout),
        orElse: () =>
          Effect.fail(
            new IndexerRequestError({
              code: "REQUEST_TIMEOUT",
              message: `The ${source.identity} indexer request timed out`,
              network: source.network,
              protocol: source.protocol,
              operationName: parameters.operationName,
              attempt,
              retryable: true,
              cause: new IndexerRequestTimeoutCause(),
            }),
          ),
      }),
    );
  });

const retryDelay = (error: IndexerRequestError, attempt: number): number => {
  if (error.retryAfter !== undefined) return Math.min(error.retryAfter, 30_000);

  const base = Math.min(250 * 2 ** (attempt - 1), 2_000);

  return Math.round(base * (0.75 + Math.random() * 0.5));
};

export const requestIndexer = <
  Result,
  VariablesType extends IndexerVariables = Record<string, never>,
>(
  config: EnsforgeConfig,
  parameters: IndexerRequestParameters<VariablesType>,
): Effect.Effect<IndexerTransportResult<Result>, IndexerTransportError> =>
  Effect.gen(function* () {
    const source = yield* Effect.try({
      try: () => resolveIndexerSource(config, parameters.protocol),
      catch: (cause) => cause as IndexerConfigError | IndexerUnavailableError,
    });

    const execute = (
      attempt: number,
    ): Effect.Effect<IndexerTransportResult<Result>, IndexerTransportError> =>
      requestOnce<Result, VariablesType>(config, source, parameters, attempt).pipe(
        Effect.catchTag("IndexerRequestError", (error) => {
          if (!error.retryable || attempt > config.indexer.retry.attempts) {
            return Effect.fail(error);
          }

          return Effect.sleep(Duration.millis(retryDelay(error, attempt))).pipe(
            Effect.andThen(execute(attempt + 1)),
          );
        }),
      );

    return yield* execute(1);
  });
