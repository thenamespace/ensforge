import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { resolveData } from "./resolve.js";
import type { DataResult, GetDataError, GetDataParameters } from "./types.js";

const getDataEffect = Effect.fn("ensforge.getData")(function* (
  config: EnsforgeConfig,
  parameters: GetDataParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(config, parameters, resolveData(name, parameters.key));
});

export const getData = defineReadAction<GetDataParameters, DataResult, GetDataError>(getDataEffect);

export { DataResult, type GetDataError, type GetDataParameters } from "./types.js";
