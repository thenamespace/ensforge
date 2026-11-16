import { Effect } from "effect";

import { defineAction } from "../../action/action.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { prepareWriteIntents } from "../../internal/write/prepare-write-intents.js";
import type { PreparedWriteCall, PrepareCallsParameters, WriteError } from "../../write/types.js";

const prepareCallsEffect = Effect.fn("ensforge.prepareCalls")(
  (config: EnsforgeConfig, parameters: PrepareCallsParameters) =>
    prepareWriteIntents(config, parameters),
);

export const prepareCalls = defineAction<
  PrepareCallsParameters,
  ReadonlyArray<PreparedWriteCall>,
  WriteError
>(prepareCallsEffect);
