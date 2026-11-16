import { Effect } from "effect";

import {
  baseRegistrarV1IsApprovedForAllAbi,
  ensRegistryV1IsApprovedForAllAbi,
  nameWrapperV1IsApprovedForAllAbi,
  nameWrapperV1IsWrappedAbi,
  publicResolverV1IsApprovedForAllAbi,
  permissionedRegistryV2InterfaceIsApprovedForAllAbi,
} from "@ensforge/contracts/internal";
import { registryInterfaceIds } from "@ensforge/contracts/v2";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { supportsInterface } from "../../../internal/capabilities/interface-support.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { analyzeName } from "../../../names/analyze.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import { findResolver } from "../../resolution/get-resolver/find.js";
import type {
  CapabilityError,
  NameCapabilityParameters,
  OperatorApprovalResult,
  OperatorApprovalTarget,
} from "../types.js";

export type GetOperatorApprovalParameters = NameCapabilityParameters & {
  readonly owner: EthereumAddress;
  readonly operator: EthereumAddress;
};

const getOperatorApprovalEffect = Effect.fn("ensforge.getOperatorApproval")(function* (
  config: EnsforgeConfig,
  parameters: GetOperatorApprovalParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);
      const ethereum = yield* EthereumClient;
      const targets: Array<OperatorApprovalTarget> = [];

      if (route.kind === "v1" || route.kind === "reserved") {
        const deployment = route.kind === "reserved" ? route.v1 : route.deployment;

        const registryApproved = yield* ethereum.readContract({
          address: deployment.contracts.registry,
          abi: ensRegistryV1IsApprovedForAllAbi,
          functionName: "isApprovedForAll",
          args: [parameters.owner, parameters.operator],
        });

        targets.push({
          kind: "registry",
          address: deployment.contracts.registry,
          supported: true,
          approved: registryApproved,
        });

        if (analyzeName(name).isSecondLevelEth) {
          const registrarApproved = yield* ethereum.readContract({
            address: deployment.contracts.baseRegistrar,
            abi: baseRegistrarV1IsApprovedForAllAbi,
            functionName: "isApprovedForAll",
            args: [parameters.owner, parameters.operator],
          });

          targets.push({
            kind: "registrar",
            address: deployment.contracts.baseRegistrar,
            supported: true,
            approved: registrarApproved,
          });
        }

        const wrapped = yield* ethereum.readContract({
          address: deployment.contracts.nameWrapper,
          abi: nameWrapperV1IsWrappedAbi,
          functionName: "isWrapped",
          args: [namehash(name)],
        });

        if (wrapped) {
          const wrapperApproved = yield* ethereum.readContract({
            address: deployment.contracts.nameWrapper,
            abi: nameWrapperV1IsApprovedForAllAbi,
            functionName: "isApprovedForAll",
            args: [parameters.owner, parameters.operator],
          });

          targets.push({
            kind: "wrapper",
            address: deployment.contracts.nameWrapper,
            supported: true,
            approved: wrapperApproved,
          });
        }
      } else {
        const tokenized = yield* supportsInterface(
          route.parentRegistry,
          registryInterfaceIds.tokenizedRegistry,
        );

        if (tokenized) {
          const approved = yield* ethereum.readContract({
            address: route.parentRegistry,
            abi: permissionedRegistryV2InterfaceIsApprovedForAllAbi,
            functionName: "isApprovedForAll",
            args: [parameters.owner, parameters.operator],
          });

          targets.push({
            kind: "registry",
            address: route.parentRegistry,
            supported: true,
            approved,
          });
        }
      }

      const resolver = yield* findResolver(name);

      if (resolver !== null) {
        const resolverApproved = yield* ethereum
          .readContract({
            address: resolver.address,
            abi: publicResolverV1IsApprovedForAllAbi,
            functionName: "isApprovedForAll",
            args: [parameters.owner, parameters.operator],
          })
          .pipe(Effect.catchTag("ContractError", () => Effect.succeed(null)));

        targets.push({
          kind: "resolver",
          address: resolver.address,
          supported: resolverApproved !== null,
          approved: resolverApproved ?? false,
        });
      }

      return {
        owner: parameters.owner,
        operator: parameters.operator,
        targets,
      } satisfies OperatorApprovalResult;
    }),
  );
});

export const getOperatorApproval = defineReadAction<
  GetOperatorApprovalParameters,
  OperatorApprovalResult,
  CapabilityError
>(getOperatorApprovalEffect);

export type {
  CapabilityError as GetOperatorApprovalError,
  OperatorApprovalResult,
  OperatorApprovalTarget,
} from "../types.js";
