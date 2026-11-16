import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { resolvePubkey } from "./resolve.js";
import type { GetPubkeyError, GetPubkeyParameters, PubkeyResult } from "./types.js";

const getPubkeyEffect = Effect.fn("ensforge.getPubkey")(function* (
  config: EnsforgeConfig,
  parameters: GetPubkeyParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(config, parameters, resolvePubkey(name));
});

export const getPubkey = defineReadAction<GetPubkeyParameters, PubkeyResult, GetPubkeyError>(
  getPubkeyEffect,
);

export { type GetPubkeyError, type GetPubkeyParameters, PubkeyResult } from "./types.js";
