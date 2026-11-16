import { Effect } from "effect";

import {
  ethRegistrarControllerV1RentPriceAbi,
  ethRegistrarV2GetRegisterPriceAbi,
} from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { getSecondLevelEthLabel } from "../../../internal/registration/second-level-eth.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { normalizeName } from "../../../names/normalize.js";
import { isAvailable } from "../../name/is-available/index.js";
import { isPaymentTokenSupported } from "../is-payment-token-supported/index.js";
import type {
  RegistrationPriceParameters,
  RegistrationPriceResult,
  RegistrationReadError,
} from "../types.js";

const getRegistrationPriceEffect = Effect.fn("ensforge.getRegistrationPrice")(function* (
  config: EnsforgeConfig,
  parameters: RegistrationPriceParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);
  const label = yield* getSecondLevelEthLabel(name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const { profile } = yield* DeploymentService;
      const available = yield* isAvailable.effect(config, parameters);

      if (!available) {
        return {
          status: "unavailable",
          name,
          protocol: profile.protocol,
          reason: "NAME_UNAVAILABLE",
        } satisfies RegistrationPriceResult;
      }

      const ethereum = yield* EthereumClient;

      if (profile.protocol === "v1") {
        const registrar = profile.v1.contracts.ethRegistrarController;

        const price = yield* ethereum.readContract({
          address: registrar,
          abi: ethRegistrarControllerV1RentPriceAbi,
          functionName: "rentPrice",
          args: [label, parameters.duration],
        });

        return {
          status: "available",
          name,
          protocol: "v1",
          registrar,
          duration: parameters.duration,
          base: price.base,
          premium: price.premium,
          total: price.base + price.premium,
          currency: { kind: "native", symbol: "ETH", decimals: 18 },
        } satisfies RegistrationPriceResult;
      }

      if (parameters.paymentToken === undefined) {
        return { status: "payment-token-required", name, protocol: "v2" } as const;
      }

      const support = yield* isPaymentTokenSupported.effect(config, {
        ...parameters,
        paymentToken: parameters.paymentToken,
      });

      if (!support.supported) {
        return {
          status: "unsupported-payment-token",
          name,
          protocol: "v2",
          paymentToken: parameters.paymentToken,
        } as const;
      }

      const registrar = profile.v2.contracts.ethRegistrar;

      const [base, premium] = yield* ethereum.readContract({
        address: registrar,
        abi: ethRegistrarV2GetRegisterPriceAbi,
        functionName: "getRegisterPrice",
        args: [label, parameters.duration, parameters.paymentToken],
      });

      return {
        status: "available",
        name,
        protocol: "v2",
        registrar,
        duration: parameters.duration,
        base,
        premium,
        total: base + premium,
        currency: {
          kind: "erc20",
          address: support.token,
          symbol: support.symbol,
          decimals: support.decimals,
        },
      } satisfies RegistrationPriceResult;
    }),
  );
});

export const getRegistrationPrice = defineReadAction<
  RegistrationPriceParameters,
  RegistrationPriceResult,
  RegistrationReadError
>(getRegistrationPriceEffect);

export type {
  RegistrationPriceParameters as GetRegistrationPriceParameters,
  RegistrationPriceResult,
  RegistrationReadError as GetRegistrationPriceError,
} from "../types.js";
