import { Effect } from "effect";

import {
  ensRegistryV1SetResolverAbi,
  ensRegistryV1SetSubnodeOwnerAbi,
  nameWrapperV1ExtendExpiryAbi,
  nameWrapperV1SetResolverAbi,
  nameWrapperV1SetSubnodeOwnerAbi,
} from "@ensforge/contracts/v1";
import { permissionedRegistryV2InterfaceAbi } from "@ensforge/contracts/v2";
import {
  permissionedRegistryV2InterfaceRenewAbi,
  permissionedRegistryV2InterfaceSetResolverAbi,
  permissionedRegistryV2InterfaceUnregisterAbi,
} from "@ensforge/contracts/v2";
import { encodeFunctionData, zeroAddress } from "viem";

import type { EnsWriteIntentPreparer } from "../../action/write-intent.js";
import { AuthorizationError } from "../../errors/authorization-error.js";
import { ContractError } from "../../errors/contract-error.js";
import { makeSingleWriteAction } from "../../internal/write/single-write-action.js";
import type { WriteError } from "../../write/types.js";
import { decodeOwnershipAddress } from "../ownership/address.js";
import { resolveSubnameRoute } from "./route.js";
import type { V2SubnameRoute } from "./route.js";
import type {
  SetSubnameExpiryParameters,
  SetSubnameManagerParameters,
  SetSubnameResolverParameters,
  SubnameParameters,
} from "./types.js";

const encoded = (operation: string, thunk: () => `0x${string}`) =>
  Effect.try({
    try: thunk,
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode ${operation}`,
        cause,
      }),
  });

const requireV2Child = (route: V2SubnameRoute) => {
  if (route.subregistry === null || route.childState === null || route.childState.status !== 2) {
    return new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `Registered subname state is unavailable for ${route.name}`,
    });
  }

  return null;
};

const deletePreparer: EnsWriteIntentPreparer<SubnameParameters, WriteError> = Effect.fn(
  "ensforge.deleteSubname.prepare",
)(function* (config, parameters) {
  const route = yield* resolveSubnameRoute(config, parameters.name);

  if (route.protocol === "v1") {
    const data = yield* encoded("deleteSubname", () =>
      route.parentWrapped
        ? encodeFunctionData({
            abi: nameWrapperV1SetSubnodeOwnerAbi,
            functionName: "setSubnodeOwner",
            args: [route.parentNode, route.label, zeroAddress, 0, route.childExpiry],
          })
        : encodeFunctionData({
            abi: ensRegistryV1SetSubnodeOwnerAbi,
            functionName: "setSubnodeOwner",
            args: [route.parentNode, route.labelhash, zeroAddress],
          }),
    );

    return {
      to: route.parentWrapped
        ? route.deployment.contracts.nameWrapper
        : route.deployment.contracts.registry,
      data,
      value: 0n,
      protocol: "v1" as const,
    };
  }

  const unavailable = requireV2Child(route);

  if (unavailable !== null || route.subregistry === null || route.childState === null) {
    return yield* (
      unavailable ??
        new AuthorizationError({
          code: "WRITE_TARGET_UNAVAILABLE",
          message: `Registered subname state is unavailable for ${route.name}`,
        })
    );
  }

  const childState = route.childState;
  const subregistry = route.subregistry;

  const data = yield* encoded("deleteSubname", () =>
    encodeFunctionData({
      abi: permissionedRegistryV2InterfaceUnregisterAbi,
      functionName: "unregister",
      args: [childState.tokenId],
    }),
  );

  return { to: subregistry, data, value: 0n, protocol: "v2" as const };
});

const managerPreparer: EnsWriteIntentPreparer<SetSubnameManagerParameters, WriteError> = Effect.fn(
  "ensforge.setSubnameManager.prepare",
)(function* (config, parameters) {
  const route = yield* resolveSubnameRoute(config, parameters.name);
  const manager = yield* decodeOwnershipAddress(parameters.manager, "subname manager");

  if (route.protocol === "v1") {
    const data = yield* encoded("setSubnameManager", () =>
      route.parentWrapped
        ? encodeFunctionData({
            abi: nameWrapperV1SetSubnodeOwnerAbi,
            functionName: "setSubnodeOwner",
            args: [route.parentNode, route.label, manager, 0, route.childExpiry],
          })
        : encodeFunctionData({
            abi: ensRegistryV1SetSubnodeOwnerAbi,
            functionName: "setSubnodeOwner",
            args: [route.parentNode, route.labelhash, manager],
          }),
    );

    return {
      to: route.parentWrapped
        ? route.deployment.contracts.nameWrapper
        : route.deployment.contracts.registry,
      data,
      value: 0n,
      protocol: "v1" as const,
    };
  }

  const unavailable = requireV2Child(route);

  if (unavailable !== null || route.subregistry === null || route.childState === null) {
    return yield* (
      unavailable ??
        new AuthorizationError({
          code: "WRITE_TARGET_UNAVAILABLE",
          message: `Registered subname state is unavailable for ${route.name}`,
        })
    );
  }

  const childState = route.childState;
  const subregistry = route.subregistry;

  const data = yield* encoded("setSubnameManager", () =>
    encodeFunctionData({
      abi: permissionedRegistryV2InterfaceAbi,
      functionName: parameters.unsafe ? "unsafeTransfer" : "safeTransferFrom",
      args: parameters.unsafe
        ? [manager, childState.tokenId, "0x"]
        : [childState.latestOwner, manager, childState.tokenId, 1n, "0x"],
    }),
  );

  return { to: subregistry, data, value: 0n, protocol: "v2" as const };
});

const resolverPreparer: EnsWriteIntentPreparer<SetSubnameResolverParameters, WriteError> =
  Effect.fn("ensforge.setSubnameResolver.prepare")(function* (config, parameters) {
    const route = yield* resolveSubnameRoute(config, parameters.name);
    const resolver = yield* decodeOwnershipAddress(parameters.resolver, "subname resolver");

    if (route.protocol === "v1") {
      const data = yield* encoded("setSubnameResolver", () =>
        route.childWrapped
          ? encodeFunctionData({
              abi: nameWrapperV1SetResolverAbi,
              functionName: "setResolver",
              args: [route.node, resolver],
            })
          : encodeFunctionData({
              abi: ensRegistryV1SetResolverAbi,
              functionName: "setResolver",
              args: [route.node, resolver],
            }),
      );

      return {
        to: route.childWrapped
          ? route.deployment.contracts.nameWrapper
          : route.deployment.contracts.registry,
        data,
        value: 0n,
        protocol: "v1" as const,
      };
    }

    const unavailable = requireV2Child(route);

    if (unavailable !== null || route.subregistry === null || route.childState === null) {
      return yield* (
        unavailable ??
          new AuthorizationError({
            code: "WRITE_TARGET_UNAVAILABLE",
            message: `Registered subname state is unavailable for ${route.name}`,
          })
      );
    }

    const childState = route.childState;
    const subregistry = route.subregistry;

    const data = yield* encoded("setSubnameResolver", () =>
      encodeFunctionData({
        abi: permissionedRegistryV2InterfaceSetResolverAbi,
        functionName: "setResolver",
        args: [childState.tokenId, resolver],
      }),
    );

    return { to: subregistry, data, value: 0n, protocol: "v2" as const };
  });

const expiryPreparer: EnsWriteIntentPreparer<SetSubnameExpiryParameters, WriteError> = Effect.fn(
  "ensforge.setSubnameExpiry.prepare",
)(function* (config, parameters) {
  const route = yield* resolveSubnameRoute(config, parameters.name);

  if (parameters.expiry > route.parentExpiry && route.parentExpiry !== 0n) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `Subname expiry cannot exceed the parent expiry for ${route.name}`,
    });
  }

  if (route.protocol === "v1") {
    if (!route.childWrapped) {
      return yield* new AuthorizationError({
        code: "WRITE_TARGET_UNAVAILABLE",
        message: `Expiry is unavailable for unwrapped V1 subname ${route.name}`,
      });
    }

    const data = yield* encoded("setSubnameExpiry", () =>
      encodeFunctionData({
        abi: nameWrapperV1ExtendExpiryAbi,
        functionName: "extendExpiry",
        args: [route.parentNode, route.labelhash, parameters.expiry],
      }),
    );

    return {
      to: route.deployment.contracts.nameWrapper,
      data,
      value: 0n,
      protocol: "v1" as const,
    };
  }

  const unavailable = requireV2Child(route);

  if (unavailable !== null || route.subregistry === null || route.childState === null) {
    return yield* (
      unavailable ??
        new AuthorizationError({
          code: "WRITE_TARGET_UNAVAILABLE",
          message: `Registered subname state is unavailable for ${route.name}`,
        })
    );
  }

  const childState = route.childState;
  const subregistry = route.subregistry;

  const data = yield* encoded("setSubnameExpiry", () =>
    encodeFunctionData({
      abi: permissionedRegistryV2InterfaceRenewAbi,
      functionName: "renew",
      args: [childState.tokenId, parameters.expiry],
    }),
  );

  return { to: subregistry, data, value: 0n, protocol: "v2" as const };
});

export const deleteSubname = makeSingleWriteAction("deleteSubname", deletePreparer);

export const setSubnameManager = makeSingleWriteAction("setSubnameManager", managerPreparer);

export const setSubnameResolver = makeSingleWriteAction("setSubnameResolver", resolverPreparer);

export const setSubnameExpiry = makeSingleWriteAction("setSubnameExpiry", expiryPreparer);
