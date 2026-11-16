import { Effect } from "effect";

import {
  ethRegistrarControllerV1MakeCommitmentAbi,
  ethRegistrarV2MakeCommitmentAbi,
} from "@ensforge/contracts/internal";
import { zeroAddress, zeroHash } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { getSecondLevelEthLabel } from "../../../internal/registration/second-level-eth.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { normalizeName } from "../../../names/normalize.js";
import type {
  RegistrationCommitment,
  RegistrationCommitmentParameters,
  RegistrationReadError,
} from "../types.js";

const makeRegistrationCommitmentEffect = Effect.fn("ensforge.makeRegistrationCommitment")(
  function* (config: EnsforgeConfig, parameters: RegistrationCommitmentParameters) {
    const name = yield* normalizeName.effect(parameters.name);
    const label = yield* getSecondLevelEthLabel(name);

    return yield* executeRead(
      config,
      parameters,
      Effect.gen(function* () {
        const { profile } = yield* DeploymentService;
        const ethereum = yield* EthereumClient;

        if (profile.protocol === "v1") {
          const registrar = profile.v1.contracts.ethRegistrarController;

          const commitment = yield* ethereum.readContract({
            address: registrar,
            abi: ethRegistrarControllerV1MakeCommitmentAbi,
            functionName: "makeCommitment",
            args: [
              {
                label,
                owner: parameters.owner,
                duration: parameters.duration,
                secret: parameters.secret,
                resolver: parameters.resolver ?? profile.v1.contracts.publicResolver,
                data: parameters.records ?? [],
                reverseRecord: parameters.reverseRecord ?? 0,
                referrer: parameters.referrer ?? zeroHash,
              },
            ],
          });

          return { name, protocol: "v1", registrar, commitment } satisfies RegistrationCommitment;
        }

        const registrar = profile.v2.contracts.ethRegistrar;

        const commitment = yield* ethereum.readContract({
          address: registrar,
          abi: ethRegistrarV2MakeCommitmentAbi,
          functionName: "makeCommitment",
          args: [
            label,
            parameters.owner,
            parameters.secret,
            parameters.subregistry ?? zeroAddress,
            parameters.resolver ?? profile.v2.contracts.publicResolver,
            parameters.duration,
            parameters.referrer ?? zeroHash,
          ],
        });

        return { name, protocol: "v2", registrar, commitment } satisfies RegistrationCommitment;
      }),
    );
  },
);

export const makeRegistrationCommitment = defineReadAction<
  RegistrationCommitmentParameters,
  RegistrationCommitment,
  RegistrationReadError
>(makeRegistrationCommitmentEffect);

export type {
  RegistrationCommitment,
  RegistrationCommitmentParameters as MakeRegistrationCommitmentParameters,
  RegistrationReadError as MakeRegistrationCommitmentError,
} from "../types.js";
