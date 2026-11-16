import { Effect } from "effect";

import { permissionedResolverV2InterfaceHasRolesAbi } from "@ensforge/contracts/internal";
import { toHex } from "viem";

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
  HasResolverRolesResult,
} from "../types.js";

export type HasResolverRolesParameters = AccountCapabilityParameters & {
  readonly roles: bigint;
  readonly record?: ResolverRecord;
};

const hasResolverRolesEffect = Effect.fn("ensforge.hasResolverRoles")(function* (
  config: EnsforgeConfig,
  parameters: HasResolverRolesParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const target = yield* readResolverPermissionTarget(name);

      if (!target.supported) return target;

      const ethereum = yield* EthereumClient;

      const part =
        parameters.record === undefined
          ? toHex(0n, { size: 32 })
          : resolverRecordPart(parameters.record);

      const resource = resolverResource(target.node, part);

      const resources = resource === 0n ? [0n] : [resource, 0n];

      const checks = yield* Effect.all(
        resources.map((candidate) =>
          ethereum.readContract({
            address: target.resolver,
            abi: permissionedResolverV2InterfaceHasRolesAbi,
            functionName: "hasRoles",
            args: [candidate, parameters.roles, parameters.account],
          }),
        ),
        { concurrency: "unbounded" },
      );

      return {
        ...target,
        resource,
        account: parameters.account,
        roles: parameters.roles,
        authorized: checks.some(Boolean),
      } as const;
    }),
  );
});

export const hasResolverRoles = defineReadAction<
  HasResolverRolesParameters,
  HasResolverRolesResult,
  CapabilityError
>(hasResolverRolesEffect);

export type { CapabilityError as HasResolverRolesError, HasResolverRolesResult } from "../types.js";
