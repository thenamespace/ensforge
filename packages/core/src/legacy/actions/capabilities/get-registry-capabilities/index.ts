import { Effect } from "effect";

import { nameWrapperV1IsWrappedAbi } from "@ensforge/contracts/internal";
import { registryInterfaceIds } from "@ensforge/contracts/v2";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { supportsInterfaces } from "../../../internal/capabilities/interface-support.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { CapabilityError, NameCapabilityParameters, RegistryCapabilities } from "../types.js";

const getRegistryCapabilitiesEffect = Effect.fn("ensforge.getRegistryCapabilities")(function* (
  config: EnsforgeConfig,
  parameters: NameCapabilityParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);
      const ethereum = yield* EthereumClient;

      if (route.kind === "v1" || route.kind === "reserved") {
        const deployment = route.kind === "reserved" ? route.v1 : route.deployment;

        const wrapped = yield* ethereum.readContract({
          address: deployment.contracts.nameWrapper,
          abi: nameWrapperV1IsWrappedAbi,
          functionName: "isWrapped",
          args: [namehash(name)],
        });

        return {
          address: wrapped ? deployment.contracts.nameWrapper : deployment.contracts.registry,
          protocol: "v1",
          kind: wrapped ? "name-wrapper" : "registry",
          owned: true,
          permissioned: false,
          temporal: wrapped,
          tokenized: wrapped,
          wrapped,
          setOwner: true,
          setResolver: true,
          createSubname: true,
          transfer: true,
          setExpiry: wrapped,
        } as const satisfies RegistryCapabilities;
      }

      const support = yield* supportsInterfaces(route.parentRegistry, registryInterfaceIds);

      return {
        address: route.parentRegistry,
        protocol: "v2",
        kind: support.wrapperRegistry ? "wrapper-registry" : "permissioned-registry",
        owned: support.ownedRegistry,
        permissioned: support.permissionedRegistry,
        temporal: support.temporalRegistry,
        tokenized: support.tokenizedRegistry,
        wrapped: support.wrapperRegistry,
        setOwner: support.ownedRegistry,
        setResolver: support.registry,
        createSubname: support.registry,
        transfer: support.tokenizedRegistry,
        setExpiry: support.temporalRegistry,
      } as const satisfies RegistryCapabilities;
    }),
  );
});

export const getRegistryCapabilities = defineReadAction<
  NameCapabilityParameters,
  RegistryCapabilities,
  CapabilityError
>(getRegistryCapabilitiesEffect);

export type {
  CapabilityError as GetRegistryCapabilitiesError,
  NameCapabilityParameters as GetRegistryCapabilitiesParameters,
  RegistryCapabilities,
} from "../types.js";
