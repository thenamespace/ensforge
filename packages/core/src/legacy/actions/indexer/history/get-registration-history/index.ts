import { Effect, Schema } from "effect";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { decodeIndexerNameIdentity } from "../../../../internal/indexer/name-identity.js";
import { getEventsPageEffect } from "../get-events/index.js";
import {
  GetRegistrationHistoryParameters as GetRegistrationHistoryParametersSchema,
  type GetRegistrationHistoryError,
  type GetRegistrationHistoryParameters,
  type GetRegistrationHistoryResult,
} from "./types.js";

const registrationKinds = ["registration", "renewal", "transfer", "migration", "expiry"] as const;

const getRegistrationHistoryEffect = Effect.fn("ensforge.getRegistrationHistory")(function* (
  config: EnsforgeConfig,
  parameters: GetRegistrationHistoryParameters,
): Effect.fn.Return<GetRegistrationHistoryResult, GetRegistrationHistoryError> {
  const decoded = yield* Schema.decodeUnknownEffect(GetRegistrationHistoryParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The registration-history query parameters are invalid",
        }),
    ),
  );

  const identity = yield* decodeIndexerNameIdentity(decoded);

  return yield* getEventsPageEffect(
    config,
    {
      filter: {
        ...(identity.name === null ? { namehash: identity.namehash } : { name: identity.name }),
        kinds: registrationKinds,
      },
      ...(decoded.pageSize === undefined ? {} : { pageSize: decoded.pageSize }),
      ...(decoded.cursor === undefined ? {} : { cursor: decoded.cursor }),
    },
    "getRegistrationHistory",
  );
});

export const getRegistrationHistory = defineAction(getRegistrationHistoryEffect);

export type {
  GetRegistrationHistoryError,
  GetRegistrationHistoryParameters,
  GetRegistrationHistoryResult,
} from "./types.js";
