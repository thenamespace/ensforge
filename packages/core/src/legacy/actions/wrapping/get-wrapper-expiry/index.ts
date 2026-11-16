import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { resolveWrapperRoute } from "../route.js";
import type { GetWrapperExpiryResult, WrapperReadError, WrapperReadParameters } from "../types.js";

const getWrapperExpiryEffect = Effect.fn("ensforge.getWrapperExpiry")(function* (
  config: EnsforgeConfig,
  parameters: WrapperReadParameters,
) {
  const route = yield* resolveWrapperRoute(config, parameters.name, parameters);

  if (!route.supported) {
    return {
      protocol: "v2",
      supported: false,
      reason: "WRAPPER_EXPIRY_NOT_SUPPORTED",
    } as const;
  }

  return {
    protocol: "v1",
    supported: true,
    wrapped: route.wrapped,
    expiry: route.wrapped ? route.expiry : null,
  } as const;
});

export const getWrapperExpiry = defineReadAction<
  WrapperReadParameters,
  GetWrapperExpiryResult,
  WrapperReadError
>(getWrapperExpiryEffect);

export type {
  GetWrapperExpiryResult,
  WrapperReadError as GetWrapperExpiryError,
  WrapperReadParameters as GetWrapperExpiryParameters,
} from "../types.js";
