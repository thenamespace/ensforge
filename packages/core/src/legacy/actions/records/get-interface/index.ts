import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { resolveInterface } from "./resolve.js";
import type { GetInterfaceError, GetInterfaceParameters, InterfaceResult } from "./types.js";

const getInterfaceEffect = Effect.fn("ensforge.getInterface")(function* (
  config: EnsforgeConfig,
  parameters: GetInterfaceParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(config, parameters, resolveInterface(name, parameters.interfaceId));
});

export const getInterface = defineReadAction<
  GetInterfaceParameters,
  InterfaceResult,
  GetInterfaceError
>(getInterfaceEffect);

export { type GetInterfaceError, type GetInterfaceParameters, InterfaceResult } from "./types.js";
