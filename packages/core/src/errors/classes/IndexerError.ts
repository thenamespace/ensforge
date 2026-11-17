import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in IndexerError.Code]: (options: IndexerError.Options) => EnsforgeError.Defaults;
} = {
  INDEXER_UNAVAILABLE: () => ({ shortMessage: "The indexer is unavailable." }),
  INDEXER_RATE_LIMITED: () => ({ shortMessage: "The indexer is rate limiting requests." }),
  INDEXER_RESPONSE_INVALID: () => ({
    shortMessage: "The indexer returned an unexpected response.",
  }),
  INDEXER_REQUEST_REJECTED: () => ({ shortMessage: "The indexer rejected the request." }),
  INDEXER_BEHIND: () => ({
    shortMessage: "The indexer is behind the chain.",
    hint: "Retry shortly, or read on-chain instead.",
  }),
  INDEXER_UNSUPPORTED: () => ({
    shortMessage: "The indexer does not support this query.",
    hint: "Use an indexer that serves it, e.g. `fallback([bigname(), goldsky()])`.",
  }),
};

const retryableCodes = new Set<string>([
  "INDEXER_UNAVAILABLE",
  "INDEXER_RATE_LIMITED",
  "INDEXER_BEHIND",
]);

/**
 * An indexer request failed, or the indexer cannot serve the query (`INDEXER_UNSUPPORTED`).
 *
 * @category errors
 * @since 1.0.0
 */
export class IndexerError extends EnsforgeError<"IndexerError", IndexerError.Code> {
  /** The indexer's own error code, e.g. bigname's `rate_limited`. */
  readonly indexerCode: string | undefined;
  /** HTTP status of the failed request. */
  readonly status: number | undefined;
  /** Route that failed, e.g. `/v1/names/{name}`. */
  readonly route: string | undefined;
  /** Adapter that failed, e.g. `bigname`. */
  readonly source: string | undefined;

  constructor(options: IndexerError.Options) {
    super(
      "IndexerError",
      withDefaults(defaults[options.code](options), options, retryableCodes.has(options.code)),
    );
    this.indexerCode = options.indexerCode;
    this.status = options.status;
    this.route = options.route;
    this.source = options.source;
  }
}

export declare namespace IndexerError {
  type Code =
    | "INDEXER_UNAVAILABLE"
    | "INDEXER_RATE_LIMITED"
    | "INDEXER_RESPONSE_INVALID"
    | "INDEXER_REQUEST_REJECTED"
    | "INDEXER_BEHIND"
    | "INDEXER_UNSUPPORTED";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly indexerCode?: string | undefined;
    readonly status?: number | undefined;
    readonly route?: string | undefined;
    readonly source?: string | undefined;
  };
}
