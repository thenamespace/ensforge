import { Effect } from "effect";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { normalizeName } from "../../../names/normalize.js";
import { getEnsEvents } from "../get-ens-events/index.js";
import type { EnsEventError, GetNameHistoryParameters, NameHistory } from "../types.js";

const getNameHistoryEffect = Effect.fn("ensforge.getNameHistory")(function* (
  config: EnsforgeConfig,
  parameters: GetNameHistoryParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);
  const events = yield* getEnsEvents.effect(config, parameters);

  return { name, events } satisfies NameHistory;
});

export const getNameHistory = defineAction<GetNameHistoryParameters, NameHistory, EnsEventError>(
  getNameHistoryEffect,
);

export type {
  GetNameHistoryParameters,
  NameHistory,
  EnsEventError as GetNameHistoryError,
} from "../types.js";
