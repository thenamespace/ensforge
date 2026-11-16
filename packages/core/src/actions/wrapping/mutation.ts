import { Effect } from "effect";

import {
  nameWrapperV1ExtendExpiryAbi,
  nameWrapperV1SetChildFusesAbi,
  nameWrapperV1SetFusesAbi,
  nameWrapperV1UnwrapAbi,
  nameWrapperV1UnwrapETH2LDAbi,
} from "@ensforge/contracts/internal";
import { nameWrapperFuses } from "@ensforge/contracts/v1";
import { encodeFunctionData, type Address } from "viem";

import type { EnsWriteIntentPreparer } from "../../action/write-intent.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { AuthorizationError } from "../../errors/authorization-error.js";
import { ContractError } from "../../errors/contract-error.js";
import { makeSingleWriteAction } from "../../internal/write/single-write-action.js";
import { labelhash, namehash } from "../../names/hashes.js";
import type { WriteError } from "../../write/types.js";
import { getWrapperPermissions } from "../capabilities/get-wrapper-permissions/index.js";
import { decodeOwnershipAddress } from "../ownership/address.js";
import { encodeFuseMask, wrapperFuseMasks } from "./fuse-mask.js";
import { requireV1WrapperRoute, requireWrappedRoute } from "./route.js";
import type {
  ExtendSubnameExpiryParameters,
  SetChildFusesParameters,
  SetFusesParameters,
  UnwrapNameParameters,
} from "./types.js";

const encode = (operation: string, makeData: () => `0x${string}`) =>
  Effect.try({
    try: makeData,
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode ${operation}`,
        cause,
      }),
  });

const uint64 = Effect.fn("ensforge.wrapper.uint64")(function* (value: bigint, label: string) {
  if (value < 0n || value >= 1n << 64n) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `${label} must be a uint64 value`,
    });
  }

  return value;
});

const requirePermission = Effect.fn("ensforge.wrapper.requirePermission")(function* (
  config: EnsforgeConfig,
  name: string,
  account: Address,
) {
  const permissions = yield* getWrapperPermissions.effect(config, { name, account });

  if (!permissions.supported || permissions.protocol !== "v1" || !permissions.canModify) {
    return yield* new AuthorizationError({
      code: "UNAUTHORIZED",
      message: `Account ${account} cannot modify wrapped name ${name}`,
    });
  }

  return permissions;
});

const unwrapPreparer: EnsWriteIntentPreparer<UnwrapNameParameters, WriteError> = Effect.fn(
  "ensforge.unwrapName.prepare",
)(function* (config, parameters, context) {
  const route = yield* requireWrappedRoute(config, parameters.name);
  const account = typeof context.account === "string" ? context.account : context.account.address;

  yield* requirePermission(config, route.name, account);

  if ((route.fuses & nameWrapperFuses.cannotUnwrap) !== 0) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `${route.name} cannot be unwrapped because CANNOT_UNWRAP is burned`,
    });
  }

  const manager = yield* decodeOwnershipAddress(parameters.manager, "unwrap manager");

  const registrant = yield* decodeOwnershipAddress(
    parameters.registrant ?? parameters.manager,
    "unwrap registrant",
  );

  const data = yield* encode("unwrapName", () =>
    route.analysis.isSecondLevelEth
      ? encodeFunctionData({
          abi: nameWrapperV1UnwrapETH2LDAbi,
          functionName: "unwrapETH2LD",
          args: [labelhash(route.analysis.ethSecondLevelLabel ?? ""), registrant, manager],
        })
      : encodeFunctionData({
          abi: nameWrapperV1UnwrapAbi,
          functionName: "unwrap",
          args: [
            namehash(route.analysis.parent ?? ""),
            labelhash(route.analysis.label ?? ""),
            manager,
          ],
        }),
  );

  return {
    to: route.deployment.contracts.nameWrapper,
    data,
    value: 0n,
    protocol: "v1" as const,
  };
});

const setFusesPreparer: EnsWriteIntentPreparer<SetFusesParameters, WriteError> = Effect.fn(
  "ensforge.setFuses.prepare",
)(function* (config, parameters, context) {
  const route = yield* requireWrappedRoute(config, parameters.name);
  const account = typeof context.account === "string" ? context.account : context.account.address;

  yield* requirePermission(config, route.name, account);

  if ((route.fuses & nameWrapperFuses.cannotBurnFuses) !== 0) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `${route.name} cannot burn additional fuses`,
    });
  }

  const fuses = yield* encodeFuseMask(parameters.fuses, wrapperFuseMasks.ownerControlledMask);

  const data = yield* encode("setFuses", () =>
    encodeFunctionData({
      abi: nameWrapperV1SetFusesAbi,
      functionName: "setFuses",
      args: [route.node, fuses],
    }),
  );

  return {
    to: route.deployment.contracts.nameWrapper,
    data,
    value: 0n,
    protocol: "v1" as const,
  };
});

const setChildFusesPreparer: EnsWriteIntentPreparer<SetChildFusesParameters, WriteError> =
  Effect.fn("ensforge.setChildFuses.prepare")(function* (config, parameters, context) {
    const child = yield* requireWrappedRoute(config, parameters.name);

    if (child.analysis.parent === undefined || child.analysis.label === undefined) {
      return yield* new AuthorizationError({
        code: "WRITE_TARGET_UNAVAILABLE",
        message: `${child.name} does not have a parent name`,
      });
    }

    const parent = yield* requireWrappedRoute(config, child.analysis.parent);
    const account = typeof context.account === "string" ? context.account : context.account.address;

    yield* requirePermission(config, parent.name, account);

    const fuses = yield* encodeFuseMask(parameters.fuses, nameWrapperFuses.userSettable);
    const expiry = yield* uint64(parameters.expiry, "Child expiry");

    if (expiry > parent.expiry) {
      return yield* new AuthorizationError({
        code: "WRITE_TARGET_UNAVAILABLE",
        message: `Child expiry cannot exceed the parent expiry for ${parent.name}`,
      });
    }

    if (
      (fuses & nameWrapperFuses.parentControlled) !== 0 &&
      (parent.fuses & nameWrapperFuses.cannotUnwrap) === 0
    ) {
      return yield* new AuthorizationError({
        code: "WRITE_TARGET_UNAVAILABLE",
        message: `Parent-controlled fuses require CANNOT_UNWRAP on ${parent.name}`,
      });
    }

    if (
      (child.fuses & nameWrapperFuses.parentCannotControl) !== 0 &&
      (child.fuses | fuses) !== child.fuses
    ) {
      return yield* new AuthorizationError({
        code: "WRITE_TARGET_UNAVAILABLE",
        message: `${child.name} is emancipated and cannot receive additional parent fuse changes`,
      });
    }

    const data = yield* encode("setChildFuses", () =>
      encodeFunctionData({
        abi: nameWrapperV1SetChildFusesAbi,
        functionName: "setChildFuses",
        args: [parent.node, labelhash(child.analysis.label ?? ""), fuses, expiry],
      }),
    );

    return {
      to: child.deployment.contracts.nameWrapper,
      data,
      value: 0n,
      protocol: "v1" as const,
    };
  });

const extendExpiryPreparer: EnsWriteIntentPreparer<ExtendSubnameExpiryParameters, WriteError> =
  Effect.fn("ensforge.extendSubnameExpiry.prepare")(function* (config, parameters) {
    const child = yield* requireWrappedRoute(config, parameters.name);

    if (child.analysis.parent === undefined || child.analysis.label === undefined) {
      return yield* new AuthorizationError({
        code: "WRITE_TARGET_UNAVAILABLE",
        message: `${child.name} is not a subname`,
      });
    }

    const parent = yield* requireV1WrapperRoute(config, child.analysis.parent);
    const expiry = yield* uint64(parameters.expiry, "Subname expiry");

    if (expiry <= child.expiry) {
      return yield* new AuthorizationError({
        code: "WRITE_TARGET_UNAVAILABLE",
        message: `Subname expiry must be greater than the current expiry for ${child.name}`,
      });
    }

    if (parent.wrapped && expiry > parent.expiry) {
      return yield* new AuthorizationError({
        code: "WRITE_TARGET_UNAVAILABLE",
        message: `Subname expiry cannot exceed the parent expiry for ${parent.name}`,
      });
    }

    const data = yield* encode("extendSubnameExpiry", () =>
      encodeFunctionData({
        abi: nameWrapperV1ExtendExpiryAbi,
        functionName: "extendExpiry",
        args: [
          namehash(child.analysis.parent ?? ""),
          labelhash(child.analysis.label ?? ""),
          expiry,
        ],
      }),
    );

    return {
      to: child.deployment.contracts.nameWrapper,
      data,
      value: 0n,
      protocol: "v1" as const,
    };
  });

export const unwrapName = makeSingleWriteAction("unwrapName", unwrapPreparer);

export const setFuses = makeSingleWriteAction("setFuses", setFusesPreparer);

export const setChildFuses = makeSingleWriteAction("setChildFuses", setChildFusesPreparer);

export const extendSubnameExpiry = makeSingleWriteAction(
  "extendSubnameExpiry",
  extendExpiryPreparer,
);
