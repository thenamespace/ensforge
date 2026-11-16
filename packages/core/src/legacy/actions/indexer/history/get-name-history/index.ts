import { Effect, Schema } from "effect";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { decodeIndexerNameIdentity } from "../../../../internal/indexer/name-identity.js";
import { getEventsPageEffect } from "../get-events/index.js";
import {
  GetNameHistoryParameters as GetNameHistoryParametersSchema,
  type GetNameHistoryError,
  type GetNameHistoryParameters,
  type GetNameHistoryResult,
} from "./types.js";

const getNameHistoryEffect = Effect.fn("ensforge.getNameHistory")(function* (
  config: EnsforgeConfig,
  parameters: GetNameHistoryParameters,
): Effect.fn.Return<GetNameHistoryResult, GetNameHistoryError> {
  const decoded = yield* Schema.decodeUnknownEffect(GetNameHistoryParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The name-history query parameters are invalid",
        }),
    ),
  );

  const identity = yield* decodeIndexerNameIdentity(decoded);

  return yield* getEventsPageEffect(
    config,
    {
      filter: {
        ...(identity.name === null ? { namehash: identity.namehash } : { name: identity.name }),
        ...(decoded.kinds === undefined ? {} : { kinds: decoded.kinds }),
      },
      ...(decoded.pageSize === undefined ? {} : { pageSize: decoded.pageSize }),
      ...(decoded.cursor === undefined ? {} : { cursor: decoded.cursor }),
    },
    "getNameHistory",
  );
});

export const getNameHistory = defineAction(getNameHistoryEffect);

export type {
  GetNameHistoryError,
  GetNameHistoryParameters,
  GetNameHistoryResult,
} from "./types.js";
