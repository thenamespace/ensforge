import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const isReservedEffect = Effect.fn("ensforge.isReserved")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    readNameRoute(name).pipe(Effect.map((route) => route.kind === "reserved")),
  );
});

export const isReserved = defineReadAction<GetNameStateParameters, boolean, GetNameStateError>(
  isReservedEffect,
);

export type {
  GetNameStateError as IsReservedError,
  GetNameStateParameters as IsReservedParameters,
} from "../get-name-state/types.js";
