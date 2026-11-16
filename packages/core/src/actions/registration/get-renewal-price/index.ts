import { Effect } from "effect";

import {
  ethRegistrarControllerV1RentPriceAbi,
  ethRegistrarV2RenewalPriceAbi,
  ethRenewerV1RenewalPriceAbi,
} from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { readPaymentTokenSupport } from "../../../internal/registration/payment-token.js";
import { getSecondLevelEthLabel } from "../../../internal/registration/second-level-eth.js";
import { normalizeName } from "../../../names/normalize.js";
import { isRenewable } from "../../name/is-renewable/index.js";
import type {
  RegistrationPriceParameters,
  RegistrationReadError,
  RenewalPriceResult,
} from "../types.js";

const getRenewalPriceEffect = Effect.fn("ensforge.getRenewalPrice")(function* (
  config: EnsforgeConfig,
  parameters: RegistrationPriceParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);
  const label = yield* getSecondLevelEthLabel(name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);
      const renewable = yield* isRenewable.effect(config, parameters);

      if (!renewable) {
        return {
          status: "not-renewable",
          name,
          protocol: route.protocol,
          reason: "NAME_NOT_RENEWABLE",
        } satisfies RenewalPriceResult;
      }

      const ethereum = yield* EthereumClient;

      if (route.kind === "v1") {
        const renewer = route.deployment.contracts.ethRegistrarController;

        const quote = yield* ethereum.readContract({
          address: renewer,
          abi: ethRegistrarControllerV1RentPriceAbi,
          functionName: "rentPrice",
          args: [label, parameters.duration],
        });

        return {
          status: "renewable",
          name,
          protocol: "v1",
          route: "v1-controller",
          renewer,
          duration: parameters.duration,
          price: quote.base,
          currency: { kind: "native", symbol: "ETH", decimals: 18 },
        } satisfies RenewalPriceResult;
      }

      if (parameters.paymentToken === undefined) {
        return { status: "payment-token-required", name, protocol: route.protocol } as const;
      }

      const renewer =
        route.kind === "reserved"
          ? route.deployment.migration.ethRenewerV1
          : route.deployment.contracts.ethRegistrar;

      const abi =
        route.kind === "reserved" ? ethRenewerV1RenewalPriceAbi : ethRegistrarV2RenewalPriceAbi;

      const priceOracle = yield* ethereum.readContract({
        address: renewer,
        abi,
        functionName: "rentPriceOracle",
      });

      const support = yield* readPaymentTokenSupport(priceOracle, parameters.paymentToken);

      if (!support.supported) {
        return {
          status: "unsupported-payment-token",
          name,
          protocol: route.protocol,
          paymentToken: parameters.paymentToken,
        } as const;
      }

      const price = yield* ethereum.readContract({
        address: renewer,
        abi,
        functionName: "getRenewPrice",
        args: [label, parameters.duration, parameters.paymentToken],
      });

      return {
        status: "renewable",
        name,
        protocol: route.protocol,
        route: route.kind === "reserved" ? "v1-renewer" : "v2-registrar",
        renewer,
        duration: parameters.duration,
        price,
        currency: {
          kind: "erc20",
          address: parameters.paymentToken,
          symbol: support.symbol,
          decimals: support.decimals,
        },
      } satisfies RenewalPriceResult;
    }),
  );
});

export const getRenewalPrice = defineReadAction<
  RegistrationPriceParameters,
  RenewalPriceResult,
  RegistrationReadError
>(getRenewalPriceEffect);

export type {
  RegistrationPriceParameters as GetRenewalPriceParameters,
  RegistrationReadError as GetRenewalPriceError,
  RenewalPriceResult,
} from "../types.js";
