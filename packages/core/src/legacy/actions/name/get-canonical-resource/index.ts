import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const getCanonicalResourceEffect = Effect.fn("ensforge.getCanonicalResource")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    readNameRoute(name).pipe(
      Effect.map((route) => {
        if (route.kind === "v1") return null;

        if (route.kind === "available" && route.state.expiry === 0n) return null;

        return route.state.resource;
      }),
    ),
  );
});

export const getCanonicalResource = defineReadAction<
  GetNameStateParameters,
  bigint | null,
  GetNameStateError
>(getCanonicalResourceEffect);

export type {
  GetNameStateError as GetCanonicalResourceError,
  GetNameStateParameters as GetCanonicalResourceParameters,
} from "../get-name-state/types.js";

export type GetCanonicalResourceResult = bigint | null;
