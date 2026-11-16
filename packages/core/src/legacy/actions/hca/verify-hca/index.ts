import { Effect } from "effect";

import { verifiableFactoryV2VerifyContractAbi } from "@ensforge/contracts/internal";
import { isAddressEqual } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, validateHcaAddress, validateHcaSalt } from "../../../internal/hca/context.js";
import { deriveHcaAddress } from "../../../internal/hca/derive.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { verifyHcaDeployment } from "../../../internal/hca/verify-deployment.js";
import { getAuthorizedHcaOwner } from "../get-authorized-hca-owner/index.js";
import { getHcaImplementationApproval } from "../get-hca-implementation-approval/index.js";
import { getHca } from "../get-hca/index.js";
import type { HcaErrorResult, VerifiedHcaAccount, VerifyHcaParameters } from "../types.js";

export const verifyHca = defineReadAction<VerifyHcaParameters, VerifiedHcaAccount, HcaErrorResult>(
  (config, parameters) =>
    withHcaSnapshot(config, parameters, (profile, blockNumber) =>
      Effect.gen(function* () {
        const state = yield* getHca.effect(config, { hca: parameters.hca, blockNumber });

        const initialImplementation = yield* validateHcaAddress(
          parameters.initialImplementation ?? profile.contracts.standaloneImplementation,
        );

        const salt = yield* validateHcaSalt(parameters.salt ?? profile.generation.canonicalSalt);

        if (state.status === "undeployed") {
          if (!parameters.allowUndeployed || !parameters.expectedOwner)
            return yield* new HcaError({
              code: "ACCOUNT_UNDEPLOYED",
              message: "The HCA is not deployed; counterfactual verification requires its owner",
            });

          const owner = yield* validateHcaAddress(parameters.expectedOwner);
          const wiring = yield* verifyHcaDeployment(config.publicClient, profile, blockNumber);
          const predicted = deriveHcaAddress(
            owner,
            initialImplementation,
            salt,
            profile.contracts.standaloneFactory,
            profile.deployment.contracts.verifiableFactory,
            wiring.proxyLogic,
          );

          const approved = yield* getHcaImplementationApproval.effect(config, {
            implementation: initialImplementation,
            blockNumber,
          });

          if (
            !approved ||
            !isAddressEqual(initialImplementation, profile.contracts.standaloneImplementation) ||
            !isAddressEqual(predicted, state.address)
          )
            return yield* new HcaError({
              code: "ACCOUNT_MISMATCH",
              message: "Counterfactual HCA derivation or approved implementation does not match",
            });

          return Object.freeze({
            kind: "ens-hca" as const,
            deployed: false,
            address: predicted,
            owner,
            chainId: config.chainId,
            profileId: profile.generation.id,
            initialImplementation,
            currentImplementation: initialImplementation,
            salt,
            sessionNonce: 0n,
            verifiedAtBlock: blockNumber,
          });
        }

        if (parameters.expectedOwner !== undefined) {
          const owner = yield* validateHcaAddress(parameters.expectedOwner);

          if (!isAddressEqual(state.owner, owner))
            return yield* new HcaError({
              code: "OWNER_MISMATCH",
              message: "The HCA belongs to a different owner",
            });
        }

        if (
          !isAddressEqual(initialImplementation, profile.contracts.standaloneImplementation) ||
          !isAddressEqual(state.implementation, profile.contracts.standaloneImplementation) ||
          state.accountId !== profile.generation.accountId
        ) {
          return yield* new HcaError({
            code: "ACCOUNT_MISMATCH",
            message: "The account implementation is outside the supported HCA generation",
          });
        }

        const wiring = yield* verifyHcaDeployment(config.publicClient, profile, blockNumber);

        // Matching proxy code alone does not certify ownership; verify derivation and the factory record.
        const predicted = deriveHcaAddress(
          state.owner,
          initialImplementation,
          salt,
          profile.contracts.standaloneFactory,
          profile.deployment.contracts.verifiableFactory,
          wiring.proxyLogic,
        );

        const certified = yield* getAuthorizedHcaOwner.effect(config, {
          hca: state.address,
          blockNumber,
        });

        const implementation = yield* hcaRpc(() =>
          config.publicClient.readContract({
            address: profile.deployment.contracts.verifiableFactory,
            abi: verifiableFactoryV2VerifyContractAbi,
            functionName: "verifyContract",
            args: [state.address],
            blockNumber,
          }),
        );

        if (
          !isAddressEqual(predicted, state.address) ||
          !certified ||
          !isAddressEqual(certified, state.owner) ||
          !isAddressEqual(implementation, state.implementation)
        ) {
          return yield* new HcaError({
            code: "ACCOUNT_MISMATCH",
            message:
              "HCA derivation, proxy implementation or factory owner certification does not match",
          });
        }

        return Object.freeze({
          kind: "ens-hca" as const,
          address: state.address,
          owner: state.owner,
          chainId: config.chainId,
          profileId: profile.generation.id,
          initialImplementation,
          currentImplementation: state.implementation,
          salt,
          sessionNonce: state.sessionNonce,
          verifiedAtBlock: blockNumber,
        });
      }),
    ),
);
