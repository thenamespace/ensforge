import { Effect } from "effect";

import { verifiableFactoryV2ProxyLogicAbi } from "@ensforge/contracts/internal";
import { type Address } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { hcaRpc, validateHcaAddress, validateHcaSalt } from "../../../internal/hca/context.js";
import { deriveHcaAddress } from "../../../internal/hca/derive.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import type { HcaDerivationParameters, HcaErrorResult } from "../types.js";

export const predictHcaAddress = defineReadAction<HcaDerivationParameters, Address, HcaErrorResult>(
  (config, parameters) =>
    withHcaSnapshot(config, parameters, (profile, blockNumber) =>
      Effect.gen(function* () {
        const owner = yield* validateHcaAddress(parameters.owner);

        const implementation = yield* validateHcaAddress(
          parameters.implementation ?? profile.contracts.standaloneImplementation,
        );

        const salt = yield* validateHcaSalt(parameters.salt ?? profile.generation.canonicalSalt);

        const proxyLogic = yield* hcaRpc(() =>
          config.publicClient.readContract({
            address: profile.deployment.contracts.verifiableFactory,
            abi: verifiableFactoryV2ProxyLogicAbi,
            functionName: "proxyLogic",
            blockNumber,
          }),
        );

        return deriveHcaAddress(
          owner,
          implementation,
          salt,
          profile.contracts.standaloneFactory,
          profile.deployment.contracts.verifiableFactory,
          proxyLogic,
        );
      }),
    ),
);
