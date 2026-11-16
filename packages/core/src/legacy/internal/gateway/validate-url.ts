import { Effect } from "effect";

import type { ResolvedGatewayOptions } from "../../config/gateway-options.js";
import { GatewayError } from "../../errors/gateway-error.js";
import { assertAllowedGatewayUrl } from "./ccip-request.js";

export const validateGatewayUrl = Effect.fn("validateGatewayUrl")(function* (
  value: string,
  policy: ResolvedGatewayOptions,
) {
  yield* Effect.try({
    try: () => assertAllowedGatewayUrl(value, policy),
    catch: (cause) =>
      cause instanceof GatewayError
        ? cause
        : new GatewayError({
            code: "GATEWAY_NOT_ALLOWED",
            message: "Gateway URL is invalid",
            cause,
          }),
  });
});
