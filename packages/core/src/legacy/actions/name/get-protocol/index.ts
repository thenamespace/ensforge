import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EnsProtocol } from "../../../schemas/protocol.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const getProtocolEffect = Effect.fn("ensforge.getProtocol")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    readNameRoute(name).pipe(Effect.map((route) => route.protocol)),
  );
});

export const getProtocol = defineReadAction<GetNameStateParameters, EnsProtocol, GetNameStateError>(
  getProtocolEffect,
);

export type {
  GetNameStateError as GetProtocolError,
  GetNameStateParameters as GetProtocolParameters,
} from "../get-name-state/types.js";

export type GetProtocolResult = EnsProtocol;
