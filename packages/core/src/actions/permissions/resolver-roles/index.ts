import { Effect } from "effect";

import { permissionedResolverV2RootRoleMutationAbi } from "@ensforge/contracts/internal";
import { permissionedResolverV2Abi } from "@ensforge/contracts/v2";
import { encodeFunctionData } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { readResolverPermissionTarget } from "../../../internal/capabilities/resolver-permissions.js";
import {
  resolverRecordPart,
  resolverRecordRole,
} from "../../../internal/capabilities/resolver-resource.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError } from "../../../write/types.js";
import { decodePermissionAddress } from "../address.js";
import { validateRoleBitmap } from "../roles.js";
import type {
  ResolverRolesMutationParameters,
  ResolverRootRolesMutationParameters,
} from "./types.js";

const readTarget = Effect.fn("ensforge.resolverRoles.target")(function* (
  config: EnsforgeConfig,
  name: string,
) {
  const normalized = yield* normalizeName.effect(name);
  const target = yield* executeRead(config, {}, readResolverPermissionTarget(normalized));

  if (!target.supported || target.inherited) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `A directly attached Permissioned Resolver is required for ${normalized}`,
    });
  }

  return { normalized, target } as const;
});

const makeScopedPreparer = (
  mutation: "grantRoles" | "revokeRoles",
): EnsWriteIntentPreparer<ResolverRolesMutationParameters, WriteError> =>
  Effect.fn(`ensforge.${mutation === "grantRoles" ? "grant" : "revoke"}ResolverRoles.prepare`)(
    function* (config: EnsforgeConfig, parameters) {
      const { normalized, target } = yield* readTarget(config, parameters.name);
      const account = yield* decodePermissionAddress(parameters.account, "role account");

      const roles = yield* validateRoleBitmap(
        parameters.roles ?? resolverRecordRole(parameters.record),
      );

      const expectedRole = resolverRecordRole(parameters.record);

      if (
        (parameters.record.type === "address" ||
          parameters.record.type === "text" ||
          parameters.record.type === "data" ||
          parameters.record.type === "abi" ||
          parameters.record.type === "interface") &&
        roles !== expectedRole
      ) {
        return yield* new AuthorizationError({
          code: "RECORD_UNSUPPORTED",
          message: `${parameters.record.type} authorization requires its exact resolver role`,
        });
      }

      const encodedName = yield* dnsEncodeName.effect(normalized);

      const data = yield* Effect.try({
        try: () => {
          const resource = BigInt(resolverRecordPart(parameters.record));

          if (mutation === "revokeRoles") {
            return encodeFunctionData({
              abi: permissionedResolverV2Abi,
              functionName: resource === 0n ? "revokeRootRoles" : "revokeRoles",
              args: resource === 0n ? [roles, account] : [resource, roles, account],
            });
          }

          if (resource === 0n) {
            return encodeFunctionData({
              abi: permissionedResolverV2Abi,
              functionName: "grantRootRoles",
              args: [roles, account],
            });
          }

          const record = parameters.record;
          let setter: `0x${string}`;

          switch (record.type) {
            case "address":
              setter = encodeFunctionData({
                abi: permissionedResolverV2Abi,
                functionName: "setAddress",
                args: [encodedName, record.coinType, "0x"],
              });
              break;
            case "text":
              setter = encodeFunctionData({
                abi: permissionedResolverV2Abi,
                functionName: "setText",
                args: [encodedName, record.key, ""],
              });
              break;
            case "data":
              setter = encodeFunctionData({
                abi: permissionedResolverV2Abi,
                functionName: "setData",
                args: [encodedName, record.key, "0x"],
              });
              break;
            case "abi":
              if (record.contentType === undefined) throw new Error("Missing ABI content type");
              setter = encodeFunctionData({
                abi: permissionedResolverV2Abi,
                functionName: "setABI",
                args: [encodedName, record.contentType, "0x"],
              });
              break;
            case "interface":
              if (record.interfaceId === undefined) throw new Error("Missing interface ID");
              setter = encodeFunctionData({
                abi: permissionedResolverV2Abi,
                functionName: "setInterface",
                args: [
                  encodedName,
                  record.interfaceId,
                  "0x0000000000000000000000000000000000000000",
                ],
              });
              break;
            default:
              throw new Error("Unsupported resolver permission resource");
          }

          return encodeFunctionData({
            abi: permissionedResolverV2Abi,
            functionName: "grantSetterRoles",
            args: [setter, account],
          });
        },
        catch: (cause) =>
          new ContractError({
            code: "ENCODE_FAILED",
            message: `Unable to encode ${mutation} for ${normalized}`,
            cause,
          }),
      });

      return { to: target.resolver, data, value: 0n, protocol: "v2" as const };
    },
  );

const makeRootPreparer = (
  mutation: "grantRootRoles" | "revokeRootRoles",
): EnsWriteIntentPreparer<ResolverRootRolesMutationParameters, WriteError> =>
  Effect.fn(
    `ensforge.${mutation === "grantRootRoles" ? "grant" : "revoke"}ResolverRootRoles.prepare`,
  )(function* (config: EnsforgeConfig, parameters) {
    const { normalized, target } = yield* readTarget(config, parameters.name);
    const account = yield* decodePermissionAddress(parameters.account, "root role account");
    const roles = yield* validateRoleBitmap(parameters.roles);

    const data = yield* Effect.try({
      try: () =>
        encodeFunctionData({
          abi: permissionedResolverV2RootRoleMutationAbi,
          functionName: mutation,
          args: [roles, account],
        }),
      catch: (cause) =>
        new ContractError({
          code: "ENCODE_FAILED",
          message: `Unable to encode ${mutation} for ${normalized}`,
          cause,
        }),
    });

    return { to: target.resolver, data, value: 0n, protocol: "v2" as const };
  });

export const grantResolverRoles = makeSingleWriteAction(
  "grantResolverRoles",
  makeScopedPreparer("grantRoles"),
);

export const revokeResolverRoles = makeSingleWriteAction(
  "revokeResolverRoles",
  makeScopedPreparer("revokeRoles"),
);

export const grantResolverRootRoles = makeSingleWriteAction(
  "grantResolverRootRoles",
  makeRootPreparer("grantRootRoles"),
);

export const revokeResolverRootRoles = makeSingleWriteAction(
  "revokeResolverRootRoles",
  makeRootPreparer("revokeRootRoles"),
);

export type {
  GrantResolverRolesError,
  GrantResolverRolesIntent,
  GrantResolverRolesParameters,
  GrantResolverRolesResult,
  GrantResolverRootRolesError,
  GrantResolverRootRolesIntent,
  GrantResolverRootRolesParameters,
  GrantResolverRootRolesResult,
  ResolverRolesMutationParameters,
  ResolverRootRolesMutationParameters,
  RevokeResolverRolesError,
  RevokeResolverRolesIntent,
  RevokeResolverRolesParameters,
  RevokeResolverRolesResult,
  RevokeResolverRootRolesError,
  RevokeResolverRootRolesIntent,
  RevokeResolverRootRolesParameters,
  RevokeResolverRootRolesResult,
} from "./types.js";
