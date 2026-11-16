import { HttpClientError } from "effect/http";

import { IndexerRequestError } from "../../errors/indexer-request-error.js";
import type { IndexerSource } from "./source.js";

export class IndexerRequestTimeoutCause extends Error {
  override readonly name = "IndexerRequestTimeoutCause";
}

export const retryAfterMilliseconds = (
  headers: Readonly<Record<string, string>>,
): number | undefined => {
  const value = headers["retry-after"];

  if (value === null || value === undefined) return undefined;

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);

  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

export const indexerRequestErrorFromCause = (
  source: IndexerSource,
  operationName: string,
  attempt: number,
  cause: unknown,
): IndexerRequestError => {
  const underlyingCause =
    HttpClientError.isHttpClientError(cause) && "cause" in cause.reason
      ? cause.reason.cause
      : cause;

  const aborted =
    (underlyingCause instanceof DOMException && underlyingCause.name === "AbortError") ||
    (underlyingCause instanceof Error && underlyingCause.name === "AbortError");

  return new IndexerRequestError({
    code: aborted ? "REQUEST_ABORTED" : "TRANSPORT_FAILED",
    message: aborted
      ? `The ${source.identity} indexer request was aborted`
      : `Unable to reach the ${source.identity} indexer`,
    network: source.network,
    protocol: source.protocol,
    operationName,
    attempt,
    retryable: !aborted,
    cause: underlyingCause,
  });
};
