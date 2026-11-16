import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { resolveNameRecord } from "./resolve.js";
import type { GetNameError, GetNameParameters, NameResult } from "./types.js";

const getNameEffect = Effect.fn("ensforge.getName")(function* (
  config: EnsforgeConfig,
  parameters: GetNameParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(config, parameters, resolveNameRecord(name));
});

export const getName = defineReadAction<GetNameParameters, NameResult, GetNameError>(getNameEffect);

export { type GetNameError, type GetNameParameters, NameResult } from "./types.js";
