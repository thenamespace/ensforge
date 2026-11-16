import { Effect } from "effect";

import { permissionedResolverV2InterfaceRolesAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { readResolverPermissionTarget } from "../../../internal/capabilities/resolver-permissions.js";
import {
  resolverRecordPart,
  resolverResource,
  type ResolverRecord,
} from "../../../internal/capabilities/resolver-resource.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type {
  AccountCapabilityParameters,
  CapabilityError,
  ResolverRolesResult,
} from "../types.js";

export type GetResolverRolesParameters = AccountCapabilityParameters & {
  readonly record?: ResolverRecord;
};

const getResolverRolesEffect = Effect.fn("ensforge.getResolverRoles")(function* (
  config: EnsforgeConfig,
  parameters: GetResolverRolesParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const target = yield* readResolverPermissionTarget(name);

      if (!target.supported) return target;

      const resource = resolverResource(
        target.node,
        parameters.record === undefined
          ? "0x0000000000000000000000000000000000000000000000000000000000000000"
          : resolverRecordPart(parameters.record),
      );

      const ethereum = yield* EthereumClient;

      const roles = yield* ethereum.readContract({
        address: target.resolver,
        abi: permissionedResolverV2InterfaceRolesAbi,
        functionName: "roles",
        args: [resource, parameters.account],
      });

      return { ...target, resource, account: parameters.account, roles } as const;
    }),
  );
});

export const getResolverRoles = defineReadAction<
  GetResolverRolesParameters,
  ResolverRolesResult,
  CapabilityError
>(getResolverRolesEffect);

export type { CapabilityError as GetResolverRolesError, ResolverRolesResult } from "../types.js";
