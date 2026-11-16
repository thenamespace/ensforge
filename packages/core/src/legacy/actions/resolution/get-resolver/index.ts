import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { findResolver } from "./find.js";
import type { GetResolverError, GetResolverParameters, GetResolverResult } from "./types.js";

const getResolverEffect = Effect.fn("ensforge.getResolver")(function* (
  config: EnsforgeConfig,
  parameters: GetResolverParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);
  const discovery = yield* executeRead(config, parameters, findResolver(name));

  return discovery?.address ?? null;
});

export const getResolver = defineReadAction<
  GetResolverParameters,
  GetResolverResult,
  GetResolverError
>(getResolverEffect);

export type { GetResolverError, GetResolverParameters, GetResolverResult } from "./types.js";
