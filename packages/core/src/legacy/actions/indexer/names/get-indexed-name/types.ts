import type {
  IndexerConfigError,
  IndexerDecodeError,
  IndexerFilterError,
  IndexerRequestError,
  IndexerResponseError,
  IndexerUnavailableError,
} from "../../../../errors/index.js";
import type { Namehash } from "../../../../schemas/hash.js";
import type { IndexedName } from "../../models/name.js";

export type GetIndexedNameParameters =
  | { readonly name: string; readonly namehash?: never }
  | { readonly name?: never; readonly namehash: Namehash };

export type GetIndexedNameResult = IndexedName | null;

export type GetIndexedNameError =
  | IndexerConfigError
  | IndexerDecodeError
  | IndexerFilterError
  | IndexerRequestError
  | IndexerResponseError
  | IndexerUnavailableError;
