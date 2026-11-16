import type {
  IndexerConfigError,
  IndexerDecodeError,
  IndexerFilterError,
  IndexerPaginationError,
  IndexerRequestError,
  IndexerResponseError,
  IndexerUnavailableError,
} from "../../../errors/index.js";

export type ResolverIndexerError =
  | IndexerConfigError
  | IndexerDecodeError
  | IndexerFilterError
  | IndexerPaginationError
  | IndexerRequestError
  | IndexerResponseError
  | IndexerUnavailableError;
