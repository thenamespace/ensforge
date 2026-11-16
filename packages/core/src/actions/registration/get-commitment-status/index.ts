import { Effect } from "effect";

import {
  ethRegistrarControllerV1CommitmentsAbi,
  ethRegistrarControllerV1MaxCommitmentAgeAbi,
  ethRegistrarControllerV1MinCommitmentAgeAbi,
  ethRegistrarV2CommitmentAtAbi,
  ethRegistrarV2MaxCommitmentAgeAbi,
  ethRegistrarV2MinCommitmentAgeAbi,
} from "@ensforge/contracts/internal";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readBlockTimestamp } from "../../../internal/read/block-timestamp.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { classifyCommitmentStatus } from "../../../internal/registration/commitment-status.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import type { Bytes32 } from "../../../schemas/hash.js";
import type { CommitmentStatus, RegistrationReadError } from "../types.js";

export type GetCommitmentStatusParameters = {
  readonly commitment: Bytes32;
} & BlockParameters;

const getCommitmentStatusEffect = Effect.fn("ensforge.getCommitmentStatus")(function* (
  config: EnsforgeConfig,
  parameters: GetCommitmentStatusParameters,
) {
  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const { profile } = yield* DeploymentService;
      const ethereum = yield* EthereumClient;

      const [submittedAt, minimumAge, maximumAge, currentTime] =
        profile.protocol === "v1"
          ? yield* Effect.all(
              [
                ethereum.readContract({
                  address: profile.v1.contracts.ethRegistrarController,
                  abi: ethRegistrarControllerV1CommitmentsAbi,
                  functionName: "commitments",
                  args: [parameters.commitment],
                }),
                ethereum.readContract({
                  address: profile.v1.contracts.ethRegistrarController,
                  abi: ethRegistrarControllerV1MinCommitmentAgeAbi,
                  functionName: "minCommitmentAge",
                }),
                ethereum.readContract({
                  address: profile.v1.contracts.ethRegistrarController,
                  abi: ethRegistrarControllerV1MaxCommitmentAgeAbi,
                  functionName: "maxCommitmentAge",
                }),
                readBlockTimestamp(),
              ] as const,
              { concurrency: "unbounded" },
            )
          : yield* Effect.all(
              [
                ethereum.readContract({
                  address: profile.v2.contracts.ethRegistrar,
                  abi: ethRegistrarV2CommitmentAtAbi,
                  functionName: "commitmentAt",
                  args: [parameters.commitment],
                }),
                ethereum.readContract({
                  address: profile.v2.contracts.ethRegistrar,
                  abi: ethRegistrarV2MinCommitmentAgeAbi,
                  functionName: "MIN_COMMITMENT_AGE",
                }),
                ethereum.readContract({
                  address: profile.v2.contracts.ethRegistrar,
                  abi: ethRegistrarV2MaxCommitmentAgeAbi,
                  functionName: "MAX_COMMITMENT_AGE",
                }),
                readBlockTimestamp(),
              ] as const,
              { concurrency: "unbounded" },
            );

      return classifyCommitmentStatus({
        protocol: profile.protocol,
        submittedAt,
        minimumAge,
        maximumAge,
        currentTime,
      });
    }),
  );
});

export const getCommitmentStatus = defineReadAction<
  GetCommitmentStatusParameters,
  CommitmentStatus,
  RegistrationReadError
>(getCommitmentStatusEffect);

export type {
  CommitmentStatus,
  RegistrationReadError as GetCommitmentStatusError,
} from "../types.js";
