import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { decodeFuseMask, wrapperFuseMasks } from "../fuse-mask.js";
import { resolveWrapperRoute } from "../route.js";
import type { GetFusesResult, WrapperReadError, WrapperReadParameters } from "../types.js";

const getFusesEffect = Effect.fn("ensforge.getFuses")(function* (
  config: EnsforgeConfig,
  parameters: WrapperReadParameters,
) {
  const route = yield* resolveWrapperRoute(config, parameters.name, parameters);

  if (!route.supported) {
    return { protocol: "v2", supported: false, reason: "FUSES_NOT_SUPPORTED" } as const;
  }

  return {
    protocol: "v1",
    supported: true,
    wrapped: route.wrapped,
    value: route.fuses,
    active: decodeFuseMask(route.fuses),
    ownerControlled: route.fuses & wrapperFuseMasks.ownerControlledMask,
    parentControlled: route.fuses & wrapperFuseMasks.parentControlledMask,
  } as const;
});

export const getFuses = defineReadAction<WrapperReadParameters, GetFusesResult, WrapperReadError>(
  getFusesEffect,
);

export type {
  GetFusesResult,
  WrapperReadError as GetFusesError,
  WrapperReadParameters as GetFusesParameters,
} from "../types.js";
