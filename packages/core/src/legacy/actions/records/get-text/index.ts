import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { ContractError } from "../../../errors/contract-error.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { resolveTexts } from "./resolve.js";
import type {
  GetTextError,
  GetTextParameters,
  GetTextsError,
  GetTextsParameters,
  TextResult,
} from "./types.js";

const getTextEffect = Effect.fn("ensforge.getText")(function* (
  config: EnsforgeConfig,
  parameters: GetTextParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);
  const [result] = yield* executeRead(config, parameters, resolveTexts(name, [parameters.key]));

  return result === undefined
    ? yield* new ContractError({
        code: "DECODE_FAILED",
        message: "Text resolution returned no result",
        cause: { name, key: parameters.key },
      })
    : result;
});

const getTextsEffect = Effect.fn("ensforge.getTexts")(function* (
  config: EnsforgeConfig,
  parameters: GetTextsParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(config, parameters, resolveTexts(name, parameters.keys));
});

export const getText = defineReadAction<GetTextParameters, TextResult, GetTextError>(getTextEffect);

export const getTexts = defineReadAction<
  GetTextsParameters,
  ReadonlyArray<TextResult>,
  GetTextsError
>(getTextsEffect);

export {
  TextResult,
  type GetTextError,
  type GetTextParameters,
  type GetTextsError,
  type GetTextsParameters,
} from "./types.js";
