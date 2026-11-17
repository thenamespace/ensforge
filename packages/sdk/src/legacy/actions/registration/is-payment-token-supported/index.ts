import { Effect } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { readPaymentTokenSupport } from "../../../internal/registration/payment-token.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { PaymentTokenSupport, RegistrationReadError } from "../types.js";

export type IsPaymentTokenSupportedParameters = {
  readonly paymentToken: EthereumAddress;
} & BlockParameters;

const isPaymentTokenSupportedEffect = Effect.fn("ensforge.isPaymentTokenSupported")(function* (
  config: EnsforgeConfig,
  parameters: IsPaymentTokenSupportedParameters,
) {
  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const { profile } = yield* DeploymentService;

      if (profile.protocol === "v1") {
        return {
          protocol: "v1",
          supported: false,
          reason: "NATIVE_PAYMENT_ONLY",
        } satisfies PaymentTokenSupport;
      }

      const result = yield* readPaymentTokenSupport(
        profile.v2.contracts.rentPriceOracle,
        parameters.paymentToken,
      );

      return result.supported
        ? ({
            protocol: "v2",
            supported: true,
            token: parameters.paymentToken,
            symbol: result.symbol,
            decimals: result.decimals,
          } satisfies PaymentTokenSupport)
        : ({
            protocol: "v2",
            supported: false,
            token: parameters.paymentToken,
            reason: "PAYMENT_TOKEN_NOT_SUPPORTED",
          } satisfies PaymentTokenSupport);
    }),
  );
});

export const isPaymentTokenSupported = defineReadAction<
  IsPaymentTokenSupportedParameters,
  PaymentTokenSupport,
  RegistrationReadError
>(isPaymentTokenSupportedEffect);

export type {
  PaymentTokenSupport,
  RegistrationReadError as IsPaymentTokenSupportedError,
} from "../types.js";
