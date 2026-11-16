import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { resolveSelectedRecords } from "./resolve.js";
import type {
  GetRecordsAction,
  GetRecordsError,
  GetRecordsParameters,
  GetRecordsResult,
} from "./types.js";

const getRecordsEffect = Effect.fn("ensforge.getRecords")(function* (
  config: EnsforgeConfig,
  parameters: GetRecordsParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    resolveSelectedRecords(
      config.publicClient,
      name,
      parameters.records,
      config.chainId,
      config.gateways,
      parameters.gatewayUrls,
    ),
  );
});

export const getRecords = defineReadAction<GetRecordsParameters, GetRecordsResult, GetRecordsError>(
  getRecordsEffect,
) as GetRecordsAction;

export type {
  GetRecordsAction,
  GetRecordsError,
  GetRecordsParameters,
  GetRecordsResult,
  GetRecordsSelection,
} from "./types.js";
