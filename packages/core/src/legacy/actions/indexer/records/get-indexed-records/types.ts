import { Schema } from "effect";

import type {
  IndexerConfigError,
  IndexerDecodeError,
  IndexerFilterError,
  IndexerRequestError,
  IndexerResponseError,
  IndexerUnavailableError,
} from "../../../../errors/index.js";
import { Namehash } from "../../../../schemas/hash.js";
import { IndexedResolverBinding } from "../../models/record.js";
import { IndexerSourcePageStatus } from "../../models/source.js";

export type GetIndexedRecordsParameters =
  | { readonly name: string; readonly namehash?: never }
  | { readonly name?: never; readonly namehash: typeof Namehash.Type };

export const GetIndexedRecordsResult = Schema.Struct({
  namehash: Namehash,
  authoritative: Schema.Literal(false),
  bindings: Schema.Array(IndexedResolverBinding),
  sources: Schema.Array(IndexerSourcePageStatus),
});
export type GetIndexedRecordsResult = typeof GetIndexedRecordsResult.Type;

export type GetIndexedRecordsError =
  | IndexerConfigError
  | IndexerDecodeError
  | IndexerFilterError
  | IndexerRequestError
  | IndexerResponseError
  | IndexerUnavailableError;
