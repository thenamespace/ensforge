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
};

const retryableCodes = new Set<string>([
  "INDEXER_UNAVAILABLE",
  "INDEXER_RATE_LIMITED",
  "INDEXER_BEHIND",
]);

/**
 * A bigname-compatible indexer request failed.
 *
 * @category errors
 * @since 1.0.0
 */
export class IndexerError extends EnsforgeError<"IndexerError", IndexerError.Code> {
  /** The indexer's own error code, e.g. bigname's `rate_limited`. */
  readonly indexerCode: string | undefined;
  readonly status: number | undefined;
  readonly route: string | undefined;

  constructor(options: IndexerError.Options) {
    super(
      "IndexerError",
      withDefaults(defaults[options.code](options), options, retryableCodes.has(options.code)),
    );
    this.indexerCode = options.indexerCode;
    this.status = options.status;
    this.route = options.route;
  }
}

export declare namespace IndexerError {
  type Code =
    | "INDEXER_UNAVAILABLE"
    | "INDEXER_RATE_LIMITED"
    | "INDEXER_RESPONSE_INVALID"
    | "INDEXER_REQUEST_REJECTED"
    | "INDEXER_BEHIND";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly indexerCode?: string | undefined;
    readonly status?: number | undefined;
    readonly route?: string | undefined;
  };
}
