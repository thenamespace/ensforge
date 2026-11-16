import { Effect } from "effect";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { WritePlanError } from "../../../errors/write-plan-error.js";
import { resolverRecordRole } from "../../../internal/capabilities/resolver-resource.js";
import { sendCalls } from "../../batch/send-calls.js";
import { getRecordPermissions } from "../../capabilities/get-record-permissions/index.js";
import { getResolverCapabilities } from "../../capabilities/get-resolver-capabilities/index.js";
import { getProtocol } from "../../name/get-protocol/index.js";
import { decodePermissionAddress } from "../address.js";
import { setResolverDelegateApproval } from "../resolver-delegate-approval/index.js";
import { grantResolverRoles, revokeResolverRoles } from "../resolver-roles/index.js";
import type {
  SetRecordPermissionsError,
  SetRecordPermissionsParameters,
  SetRecordPermissionsResult,
} from "./types.js";

const implementation = Effect.fn("ensforge.setRecordPermissions")(function* (
  config: EnsforgeConfig,
  parameters: SetRecordPermissionsParameters,
): Effect.fn.Return<SetRecordPermissionsResult, SetRecordPermissionsError> {
  if (parameters.records.length === 0) {
    return yield* new WritePlanError({
      code: "INVALID_CALL_PLAN",
      message: "setRecordPermissions requires at least one record permission",
      cause: parameters.records,
    });
  }

  const account = yield* decodePermissionAddress(parameters.account, "permission account");

  const [protocol, resolver, permissions] = yield* Effect.all(
    [
      getProtocol.effect(config, { name: parameters.name }),
      getResolverCapabilities.effect(config, { name: parameters.name }),
      getRecordPermissions.effect(config, {
        name: parameters.name,
        account,
        records: parameters.records,
      }),
    ] as const,
    { concurrency: "unbounded" },
  );

  if (resolver.address === null || resolver.inherited) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `A directly attached resolver is required for ${parameters.name}`,
    });
  }

  const unsupported = permissions.records.find((permission) => !permission.supported);

  if (unsupported !== undefined) {
    return yield* new AuthorizationError({
      code: "RECORD_UNSUPPORTED",
      message: `The resolver for ${parameters.name} does not support ${unsupported.record.type} permissions`,
    });
  }

  if (resolver.authorization === "owner-delegate") {
    if (parameters.allowScopeWidening !== true) {
      return yield* new AuthorizationError({
        code: "SCOPE_WIDENING_REQUIRED",
        message: `Public Resolver delegation widens the requested permissions to every record for ${parameters.name}`,
      });
    }

    const execution = yield* sendCalls.effect(config, {
      calls: [
        setResolverDelegateApproval.call({
          name: parameters.name,
          delegate: account,
          approved: parameters.approved,
        }),
      ],
      ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
      ...(parameters.walletAccount === undefined ? {} : { account: parameters.walletAccount }),
      mode: "sequential",
      atomicity: "none",
      ...(parameters.confirmation === undefined ? {} : { confirmation: parameters.confirmation }),
    });

    return {
      model: "public-resolver-delegate",
      protocol,
      resolver: resolver.address,
      account,
      approved: parameters.approved,
      scope: "node",
      widened: true,
      execution,
    };
  }

  if (resolver.authorization !== "role" || protocol !== "v2") {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `The resolver permission model for ${parameters.name} is not supported`,
    });
  }

  if (parameters.approved && parameters.allowScopeWidening !== true) {
    return yield* new AuthorizationError({
      code: "SCOPE_WIDENING_REQUIRED",
      message:
        "Permissioned Resolver grants apply to the selected record arguments across every name served by this resolver",
    });
  }

  const exact = permissions.records.map((permission) => ({
    record: permission.record,
    resource: permission.resource,
    roles: resolverRecordRole(permission.record),
  }));

  const invalid = exact.find(
    (permission) => permission.resource === null || permission.roles === 0n,
  );

  if (invalid !== undefined) {
    return yield* new AuthorizationError({
      code: "RECORD_UNSUPPORTED",
      message: `Exact ${invalid.record.type} permissions are unavailable for ${parameters.name}`,
    });
  }

  const calls = exact.map((permission) =>
    parameters.approved
      ? grantResolverRoles.call({
          name: parameters.name,
          account,
          record: permission.record,
          roles: permission.roles,
        })
      : revokeResolverRoles.call({
          name: parameters.name,
          account,
          record: permission.record,
          roles: permission.roles,
        }),
  );

  const execution = yield* sendCalls.effect(config, {
    calls,
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.walletAccount === undefined ? {} : { account: parameters.walletAccount }),
    ...(parameters.mode === undefined ? {} : { mode: parameters.mode }),
    ...(parameters.atomicity === undefined ? {} : { atomicity: parameters.atomicity }),
    ...(parameters.confirmation === undefined ? {} : { confirmation: parameters.confirmation }),
    ...(parameters.capabilities === undefined ? {} : { capabilities: parameters.capabilities }),
  });

  return {
    model: "permissioned-resolver-roles",
    protocol: "v2",
    resolver: resolver.address,
    account,
    approved: parameters.approved,
    scope: "resolver",
    widened: true,
    permissions: exact.map((permission) => ({
      record: permission.record,
      resource: permission.resource as bigint,
      roles: permission.roles,
    })),
    execution,
  };
});

export const setRecordPermissions = defineAction<
  SetRecordPermissionsParameters,
  SetRecordPermissionsResult,
  SetRecordPermissionsError
>(implementation);

export type {
  AppliedRecordPermission,
  SetRecordPermissionsError,
  SetRecordPermissionsParameters,
  SetRecordPermissionsResult,
} from "./types.js";
