import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { resolveAbi } from "./resolve.js";
import type { AbiResult, GetAbiError, GetAbiParameters } from "./types.js";

const defaultContentTypes = ["json", "zlib-json", "cbor", "uri"] as const;

const getAbiEffect = Effect.fn("ensforge.getAbi")(function* (
  config: EnsforgeConfig,
  parameters: GetAbiParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    resolveAbi(name, parameters.contentTypes ?? defaultContentTypes),
  );
});

export const getAbi = defineReadAction<GetAbiParameters, AbiResult, GetAbiError>(getAbiEffect);

export { AbiResult, type GetAbiError, type GetAbiParameters } from "./types.js";
