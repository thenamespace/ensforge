import { Effect } from "effect";

import {
  ethRegistrarControllerV1MaxCommitmentAgeAbi,
  ethRegistrarControllerV1MinCommitmentAgeAbi,
  ethRegistrarControllerV1MinRegistrationDurationAbi,
  ethRegistrarControllerV1PricesAbi,
  ethRegistrarV2MaxCommitmentAgeAbi,
  ethRegistrarV2MinCommitmentAgeAbi,
  ethRegistrarV2MinRegisterDurationAbi,
  ethRegistrarV2MinRenewDurationAbi,
  ethRegistrarV2RentPriceOracleAbi,
} from "@ensforge/contracts/internal";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import type { RegistrationParameters, RegistrationReadError } from "../types.js";

export type GetRegistrationParametersParameters = BlockParameters;

const getRegistrationParametersEffect = Effect.fn("ensforge.getRegistrationParameters")(function* (
  config: EnsforgeConfig,
  parameters: GetRegistrationParametersParameters,
) {
  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const { profile } = yield* DeploymentService;
      const ethereum = yield* EthereumClient;

      if (profile.protocol === "v1") {
        const controller = profile.v1.contracts.ethRegistrarController;

        const [
          minimumRegistrationDuration,
          minimumCommitmentAge,
          maximumCommitmentAge,
          priceOracle,
        ] = yield* Effect.all(
          [
            ethereum.readContract({
              address: controller,
              abi: ethRegistrarControllerV1MinRegistrationDurationAbi,
              functionName: "MIN_REGISTRATION_DURATION",
            }),
            ethereum.readContract({
              address: controller,
              abi: ethRegistrarControllerV1MinCommitmentAgeAbi,
              functionName: "minCommitmentAge",
            }),
            ethereum.readContract({
              address: controller,
              abi: ethRegistrarControllerV1MaxCommitmentAgeAbi,
              functionName: "maxCommitmentAge",
            }),
            ethereum.readContract({
              address: controller,
              abi: ethRegistrarControllerV1PricesAbi,
              functionName: "prices",
            }),
          ] as const,
          { concurrency: "unbounded" },
        );

        return {
          protocol: "v1",
          registrar: controller,
          priceOracle,
          minimumRegistrationDuration,
          minimumRenewalDuration: 0n,
          minimumCommitmentAge,
          maximumCommitmentAge,
          payment: { kind: "native" },
        } satisfies RegistrationParameters;
      }

      const registrar = profile.v2.contracts.ethRegistrar;

      const [
        minimumRegistrationDuration,
        minimumRenewalDuration,
        minimumCommitmentAge,
        maximumCommitmentAge,
        priceOracle,
      ] = yield* Effect.all(
        [
          ethereum.readContract({
            address: registrar,
            abi: ethRegistrarV2MinRegisterDurationAbi,
            functionName: "MIN_REGISTER_DURATION",
          }),
          ethereum.readContract({
            address: registrar,
            abi: ethRegistrarV2MinRenewDurationAbi,
            functionName: "MIN_RENEW_DURATION",
          }),
          ethereum.readContract({
            address: registrar,
            abi: ethRegistrarV2MinCommitmentAgeAbi,
            functionName: "MIN_COMMITMENT_AGE",
          }),
          ethereum.readContract({
            address: registrar,
            abi: ethRegistrarV2MaxCommitmentAgeAbi,
            functionName: "MAX_COMMITMENT_AGE",
          }),
          ethereum.readContract({
            address: registrar,
            abi: ethRegistrarV2RentPriceOracleAbi,
            functionName: "rentPriceOracle",
          }),
        ] as const,
        { concurrency: "unbounded" },
      );

      return {
        protocol: "v2",
        registrar,
        priceOracle,
        minimumRegistrationDuration,
        minimumRenewalDuration,
        minimumCommitmentAge,
        maximumCommitmentAge,
        payment: { kind: "erc20", enumerable: false },
      } satisfies RegistrationParameters;
    }),
  );
});

export const getRegistrationParameters = defineReadAction<
  GetRegistrationParametersParameters,
  RegistrationParameters,
  RegistrationReadError
>(getRegistrationParametersEffect);

export type {
  RegistrationParameters,
  RegistrationReadError as GetRegistrationParametersError,
} from "../types.js";
