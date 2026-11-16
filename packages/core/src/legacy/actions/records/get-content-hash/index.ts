import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { resolveContentHash } from "./resolve.js";
import type { ContentHashResult, GetContentHashError, GetContentHashParameters } from "./types.js";

const getContentHashEffect = Effect.fn("ensforge.getContentHash")(function* (
  config: EnsforgeConfig,
  parameters: GetContentHashParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(config, parameters, resolveContentHash(name));
});

export const getContentHash = defineReadAction<
  GetContentHashParameters,
  ContentHashResult,
  GetContentHashError
>(getContentHashEffect);

export {
  ContentHashResult,
  type GetContentHashError,
  type GetContentHashParameters,
} from "./types.js";
