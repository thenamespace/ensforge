import { Clock, Effect, Predicate, Result, Schema, Record as Rec, Array as Arr } from "effect";

import { IndexerError } from "../../errors/classes/IndexerError.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";

/** A query string value; arrays are sent comma-separated unless `repeat` lists the key. */
export type QueryValue = string | number | bigint | boolean | readonly string[] | undefined;

/** Connection settings of one REST indexer. */
export type HttpConfig = {
  /** Adapter id, for errors. */
  readonly id: string;
  /** Base URL including the version prefix, e.g. `https://api.bigname.sh/v1`. */
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly fetch: typeof fetch;
  readonly timeout: number;
  readonly retryCount: number;
  /** ETag cache, when enabled. */
  readonly cache: Map<string, { readonly etag: string; readonly body: unknown }> | undefined;
};

export type HttpRequest = {
  /** Route template for errors, e.g. `/names/{name}`. */
  readonly route: string;
  /** Path below the base URL, already encoded. */
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>> | undefined;
  /** Keys whose array values repeat the parameter instead of joining with commas. */
  readonly repeat?: readonly string[] | undefined;
  /** JSON body; sends a POST. */
  readonly body?: unknown;
  /** What a 404 means, for `NotFoundError.resource`. */
  readonly resource?: string | undefined;
};

// bigname's error codes (shared by every bigname-compatible server).
const codes: Readonly<Record<string, IndexerError.Code>> = {
  stale: "INDEXER_BEHIND",
  rate_limited: "INDEXER_RATE_LIMITED",
  overloaded: "INDEXER_RATE_LIMITED",
  request_timeout: "INDEXER_UNAVAILABLE",
  internal_error: "INDEXER_UNAVAILABLE",
  unsupported: "INDEXER_UNSUPPORTED",
  invalid_input: "INDEXER_REQUEST_REJECTED",
  conflict: "INDEXER_REQUEST_REJECTED",
};

const codeForStatus = (status: number): IndexerError.Code =>
  status === 429
    ? "INDEXER_RATE_LIMITED"
    : status === 408 || status >= 500
      ? "INDEXER_UNAVAILABLE"
      : "INDEXER_REQUEST_REJECTED";

const urlOf = (config: HttpConfig, request: HttpRequest): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Rec.toEntries(request.query ?? {})) {
    if (value === undefined) continue;
    if (Arr.isArray(value)) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `Arr.isArray` narrows to `unknown[]`, which loses the string element type
      const values = value as readonly string[];
      if (values.length === 0) continue;
      if (request.repeat?.includes(key) === true)
        for (const item of values) params.append(key, item);
      else params.set(key, Arr.join(values, ","));
    } else {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return `${config.baseUrl}${request.path}${search === "" ? "" : `?${search}`}`;
};

/**
 * Seconds or an HTTP date, as `Retry-After` allows, capped at 30 seconds; `undefined` when absent
 * or unusable.
 */
const retryAfter = (header: string | null, now: number): number | undefined => {
  if (header === null) return undefined;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 30_000) : undefined;
};

type Attempt =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly error: IndexerError | NotFoundError; readonly delay?: number };

const errorBody = (body: unknown): { code?: string; message?: string } => {
  if (!Predicate.isObject(body) || !Predicate.isObject(body.error)) return {};
  const { code, message } = body.error;
  return {
    ...(Predicate.isString(code) ? { code } : {}),
    ...(Predicate.isString(message) ? { message } : {}),
  };
};

const decodeJson = Schema.decodeResult(Schema.fromJsonString(Schema.Unknown));

const attempt = (config: HttpConfig, request: HttpRequest, url: string): Effect.Effect<Attempt> => {
  const cached = request.body === undefined ? config.cache?.get(url) : undefined;
  const fail = (code: IndexerError.Code, extra: Partial<IndexerError.Options> = {}) =>
    new IndexerError({ code, route: request.route, source: config.id, ...extra });

  const unreachable = (cause: unknown) =>
    fail("INDEXER_UNAVAILABLE", { shortMessage: "The indexer could not be reached.", cause });
  const encodedBody: Effect.Effect<string | undefined, IndexerError> =
    request.body === undefined
      ? Effect.undefined
      : Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(request.body).pipe(
          Effect.mapError(unreachable),
        );

  return encodedBody.pipe(
    Effect.flatMap((body) =>
      Effect.tryPromise({
        // oxlint-disable-next-line effecttsgo/async-function -- `config.fetch` is a user-supplied Promise function
        try: async (signal) => {
          const response = await config.fetch(url, {
            method: request.body === undefined ? "GET" : "POST",
            headers: {
              accept: "application/json",
              ...(request.body === undefined ? {} : { "content-type": "application/json" }),
              ...(cached === undefined ? {} : { "if-none-match": cached.etag }),
              ...config.headers,
            },
            ...(body === undefined ? {} : { body }),
            signal,
          });
          const text = response.status === 304 ? "" : await response.text();
          return { response, text };
        },
        // Network failures (DNS, reset, CORS) are retryable.
        catch: unreachable,
      }),
    ),
    Effect.timeoutOrElse({
      duration: config.timeout,
      orElse: () =>
        Effect.fail(
          fail("INDEXER_UNAVAILABLE", { shortMessage: "The indexer did not answer in time." }),
        ),
    }),
    Effect.flatMap(({ response, text }) =>
      Effect.map(Clock.currentTimeMillis, (now): Attempt => {
        if (response.status === 304 && cached !== undefined) return { ok: true, body: cached.body };

        const parsed = text === "" ? Result.succeed(undefined) : decodeJson(text);
        if (Result.isFailure(parsed) && response.ok) {
          return { ok: false, error: fail("INDEXER_RESPONSE_INVALID", { cause: parsed.failure }) };
        }
        const body: unknown = Result.getOrUndefined(parsed);

        if (response.ok) {
          const etag = response.headers.get("etag");
          if (config.cache !== undefined && etag !== null && request.body === undefined) {
            // At most 500 entries; the oldest goes first.
            if (config.cache.size >= 500) {
              const oldest = config.cache.keys().next().value;
              if (oldest !== undefined) config.cache.delete(oldest);
            }
            config.cache.set(url, { etag, body });
          }
          return { ok: true, body };
        }

        const { code, message } = errorBody(body);
        if (response.status === 404 || code === "not_found") {
          return {
            ok: false,
            error: new NotFoundError({
              code: "INDEXER_NOT_FOUND",
              resource: request.resource,
              ...(message === undefined ? {} : { details: [message] }),
            }),
          };
        }
        const error = fail(
          (code === undefined ? undefined : codes[code]) ?? codeForStatus(response.status),
          {
            indexerCode: code,
            status: response.status,
            ...(message === undefined ? {} : { details: [message] }),
          },
        );
        return [408, 429, 502, 503, 504].includes(response.status)
          ? { ok: false, error, delay: retryAfter(response.headers.get("retry-after"), now) ?? -1 }
          : { ok: false, error };
      }),
    ),
    Effect.catch((error) => Effect.succeed<Attempt>({ ok: false, error, delay: -1 })),
  );
};

/**
 * Sends one request to a REST indexer and returns its JSON body.
 *
 * - Retries `408`, `429`, `502`–`504`, timeouts and network failures up to `retryCount` times,
 *   waiting for `Retry-After` when given, otherwise 250 ms doubling.
 * - A `404` (or the `not_found` code) fails with `NotFoundError` (`INDEXER_NOT_FOUND`).
 * - With the ETag cache, a `304` answer returns the cached body.
 */
export const send = Effect.fnUntraced(function* (
  config: HttpConfig,
  request: HttpRequest,
): Effect.fn.Return<unknown, IndexerError | NotFoundError> {
  const url = urlOf(config, request);

  for (let retry = 0; ; retry += 1) {
    const result = yield* attempt(config, request, url);
    if (result.ok) return result.body;
    if (result.delay === undefined || retry >= config.retryCount) {
      return yield* Effect.fail(result.error);
    }
    yield* Effect.sleep(result.delay >= 0 ? result.delay : 250 * 2 ** retry);
  }
});
