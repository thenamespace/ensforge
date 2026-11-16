import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import { getCommitmentStatus } from "../get-commitment-status/index.js";
import { getRegistrationParameters } from "../get-registration-parameters/index.js";
import { getRegistrationPrice } from "../get-registration-price/index.js";
import { makeRegistrationCommitment } from "../make-registration-commitment/index.js";
import type {
  RegistrationCommitmentParameters,
  RegistrationPlan,
  RegistrationReadError,
} from "../types.js";

export type GetRegistrationPlanParameters = RegistrationCommitmentParameters & {
  readonly paymentToken?: EthereumAddress;
};

const getRegistrationPlanEffect = Effect.fn("ensforge.getRegistrationPlan")(function* (
  config: EnsforgeConfig,
  parameters: GetRegistrationPlanParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const price = yield* getRegistrationPrice.effect(config, parameters);

      if (price.status === "unavailable") return { status: "unavailable", name } as const;

      if (price.status === "payment-token-required") {
        return { status: "payment-token-required", name } as const;
      }

      if (price.status === "unsupported-payment-token") {
        return {
          status: "unsupported-payment-token",
          name,
          paymentToken: price.paymentToken,
        } as const;
      }

      const [registrationParameters, commitment] = yield* Effect.all(
        [
          getRegistrationParameters.effect(config, parameters),
          makeRegistrationCommitment.effect(config, parameters),
        ] as const,
        { concurrency: "unbounded" },
      );

      const commitmentStatus = yield* getCommitmentStatus.effect(config, {
        ...parameters,
        commitment: commitment.commitment,
      });

      const status =
        commitmentStatus.status === "not-found"
          ? "commitment-required"
          : commitmentStatus.status === "pending"
            ? "commitment-pending"
            : commitmentStatus.status === "expired"
              ? "commitment-expired"
              : "ready";

      return {
        status,
        name,
        parameters: registrationParameters,
        price,
        commitment,
        commitmentStatus,
      } satisfies RegistrationPlan;
    }),
  );
});

export const getRegistrationPlan = defineReadAction<
  GetRegistrationPlanParameters,
  RegistrationPlan,
  RegistrationReadError
>(getRegistrationPlanEffect);

export type {
  RegistrationPlan,
  RegistrationReadError as GetRegistrationPlanError,
} from "../types.js";
