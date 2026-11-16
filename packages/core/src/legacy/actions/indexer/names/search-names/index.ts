import { Effect, Schema } from "effect";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { IndexerCursor } from "../../models/pagination.js";
import { NameFilter, NameOrder, NameSearchMode } from "../../models/query.js";
import { getNames } from "../get-names/index.js";
import type { GetNamesError, GetNamesResult } from "../get-names/types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const SearchNamesParameters = Schema.Struct({
  query: Schema.String,
  field: Schema.optional(Schema.Literals(["name", "label"])),
  mode: Schema.optional(NameSearchMode),
  filter: Schema.optional(NameFilter),
  order: Schema.optional(NameOrder),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type SearchNamesParameters = typeof SearchNamesParameters.Type;

export type SearchNamesResult = GetNamesResult;

export type SearchNamesError = GetNamesError;

const searchNamesEffect = Effect.fn("ensforge.searchNames")(function* (
  config: EnsforgeConfig,
  parameters: SearchNamesParameters,
): Effect.fn.Return<SearchNamesResult, SearchNamesError> {
  const decoded = yield* Schema.decodeUnknownEffect(SearchNamesParameters)(parameters).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The name-search parameters are invalid",
        }),
    ),
  );

  if (decoded.query.length === 0) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "A non-empty search query is required",
    });
  }

  return yield* getNames.effect(config, {
    filter: {
      ...decoded.filter,
      search: {
        field: decoded.field ?? "label",
        mode: decoded.mode ?? "contains",
        value: decoded.query,
      },
    },
    ...(decoded.order === undefined ? {} : { order: decoded.order }),
    ...(decoded.pageSize === undefined ? {} : { pageSize: decoded.pageSize }),
    ...(decoded.cursor === undefined ? {} : { cursor: decoded.cursor }),
  });
});

export const searchNames = defineAction(searchNamesEffect);
