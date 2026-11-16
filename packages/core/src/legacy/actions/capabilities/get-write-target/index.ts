import { Effect } from "effect";

import { nameWrapperV1IsWrappedAbi } from "@ensforge/contracts/internal";
import { registryInterfaceIds } from "@ensforge/contracts/v2";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { supportsInterface } from "../../../internal/capabilities/interface-support.js";
import { isResolverRecord } from "../../../internal/capabilities/resolver-resource.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { analyzeName } from "../../../names/analyze.js";
import { labelhash, namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import { getNameStatus } from "../../name/get-name-status/index.js";
import { findResolver } from "../../resolution/get-resolver/find.js";
import type {
  CapabilityError,
  NameCapabilityParameters,
  WriteOperation,
  WriteTarget,
} from "../types.js";

export type GetWriteTargetParameters = NameCapabilityParameters & {
  readonly operation: WriteOperation;
};

const getWriteTargetEffect = Effect.fn("ensforge.getWriteTarget")(function* (
  config: EnsforgeConfig,
  parameters: GetWriteTargetParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);
      const protocol = route.kind === "v1" || route.kind === "reserved" ? "v1" : "v2";
      const status = yield* getNameStatus.effect(config, parameters);

      if (route.kind === "available" || status === "available" || status === "expired") {
        return { available: false, protocol, reason: "NAME_NOT_REGISTERED" } as const;
      }

      const node = namehash(name);

      if (isResolverRecord(parameters.operation)) {
        const resolver = yield* findResolver(name);

        return resolver === null
          ? ({ available: false, protocol, reason: "RESOLVER_NOT_FOUND" } as const)
          : ({
              available: true,
              protocol,
              kind: "resolver",
              address: resolver.address,
              operation: parameters.operation,
              node,
              tokenId: null,
              resource: null,
              inheritedResolver: resolver.offset > 0n,
            } as const);
      }

      if (route.kind === "v1" || route.kind === "reserved") {
        if (parameters.operation.type === "setExpiry") {
          return { available: false, protocol: "v1", reason: "OPERATION_UNSUPPORTED" } as const;
        }

        const deployment = route.kind === "reserved" ? route.v1 : route.deployment;
        const ethereum = yield* EthereumClient;

        const wrapped = yield* ethereum.readContract({
          address: deployment.contracts.nameWrapper,
          abi: nameWrapperV1IsWrappedAbi,
          functionName: "isWrapped",
          args: [node],
        });

        const analysis = analyzeName(name);

        const registrarTransfer =
          parameters.operation.type === "transfer" && analysis.isSecondLevelEth;

        const kind = wrapped ? "name-wrapper" : registrarTransfer ? "registrar" : "registry";

        const address = wrapped
          ? deployment.contracts.nameWrapper
          : registrarTransfer
            ? deployment.contracts.baseRegistrar
            : deployment.contracts.registry;

        const tokenId = wrapped
          ? BigInt(node)
          : registrarTransfer && analysis.ethSecondLevelLabel !== undefined
            ? BigInt(labelhash(analysis.ethSecondLevelLabel))
            : null;

        return {
          available: true,
          protocol: "v1",
          kind,
          address,
          operation: parameters.operation,
          node,
          tokenId,
          resource: null,
          inheritedResolver: false,
        } as const;
      }

      const wrapped = yield* supportsInterface(
        route.parentRegistry,
        registryInterfaceIds.wrapperRegistry,
      );

      return {
        available: true,
        protocol: "v2",
        kind: wrapped ? "wrapper-registry" : "registry",
        address: route.parentRegistry,
        operation: parameters.operation,
        node,
        tokenId: route.state.tokenId,
        resource: route.state.resource,
        inheritedResolver: false,
      } as const;
    }),
  );
});

export const getWriteTarget = defineReadAction<
  GetWriteTargetParameters,
  WriteTarget,
  CapabilityError
>(getWriteTargetEffect);

export type {
  CapabilityError as GetWriteTargetError,
  WriteOperation,
  WriteTarget,
} from "../types.js";
