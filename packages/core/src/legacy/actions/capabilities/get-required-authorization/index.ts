import { Effect } from "effect";

import { registryRoles } from "@ensforge/contracts/v2";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { isResolverRecord } from "../../../internal/capabilities/resolver-resource.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import { getManager } from "../../name/get-manager/index.js";
import { getRegistrant } from "../../name/get-registrant/index.js";
import { getOperatorApproval } from "../get-operator-approval/index.js";
import { getRecordPermissions } from "../get-record-permissions/index.js";
import { getTokenApproval } from "../get-token-approval/index.js";
import { getWrapperPermissions } from "../get-wrapper-permissions/index.js";
import { getWriteTarget } from "../get-write-target/index.js";
import { hasRegistryRoles } from "../has-registry-roles/index.js";
import type {
  AuthorizationDecision,
  CapabilityError,
  NameCapabilityParameters,
  RequiredAuthorizationResult,
  WriteOperation,
} from "../types.js";

export type GetRequiredAuthorizationParameters = NameCapabilityParameters & {
  readonly account: EthereumAddress;
  readonly operation: WriteOperation;
};

const registryRoleFor = (operation: WriteOperation): bigint | null => {
  switch (operation.type) {
    case "setResolver":
      return registryRoles.setResolver;
    case "createSubname":
      return registryRoles.registrar;
    case "setExpiry":
      return registryRoles.renew;
    default:
      return null;
  }
};

const getRequiredAuthorizationEffect = Effect.fn("ensforge.getRequiredAuthorization")(function* (
  config: EnsforgeConfig,
  parameters: GetRequiredAuthorizationParameters,
) {
  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const target = yield* getWriteTarget.effect(config, parameters);

      if (!target.available) {
        return {
          account: parameters.account,
          operation: parameters.operation,
          target,
          authorization: { status: "unauthorized", requirement: { kind: "unsupported" } },
          blockers: [target.reason],
        } as const satisfies RequiredAuthorizationResult;
      }

      if (target.kind === "resolver") {
        if (!isResolverRecord(parameters.operation)) {
          return {
            account: parameters.account,
            operation: parameters.operation,
            target,
            authorization: { status: "unauthorized", requirement: { kind: "unsupported" } },
            blockers: ["OPERATION_UNSUPPORTED"],
          } as const satisfies RequiredAuthorizationResult;
        }

        const permissions = yield* getRecordPermissions.effect(config, {
          ...parameters,
          records: [parameters.operation],
        });

        const permission = permissions.records[0];

        if (permission === undefined) {
          return {
            account: parameters.account,
            operation: parameters.operation,
            target,
            authorization: { status: "unauthorized", requirement: { kind: "unsupported" } },
            blockers: ["OPERATION_UNSUPPORTED"],
          } as const satisfies RequiredAuthorizationResult;
        }

        return {
          account: parameters.account,
          operation: parameters.operation,
          target,
          authorization: permission.authorization,
          blockers: permission.supported ? [] : ["OPERATION_UNSUPPORTED"],
        } as const satisfies RequiredAuthorizationResult;
      }

      if (target.kind === "name-wrapper") {
        const wrapper = yield* getWrapperPermissions.effect(config, parameters);

        if (!wrapper.supported || wrapper.protocol !== "v1") {
          return {
            account: parameters.account,
            operation: parameters.operation,
            target,
            authorization: {
              status: "unauthorized",
              requirement: { kind: "wrapper-permission" },
            },
            blockers: ["OPERATION_UNSUPPORTED"],
          } as const satisfies RequiredAuthorizationResult;
        }

        const fuseAllows =
          parameters.operation.type === "setResolver"
            ? wrapper.canSetResolver
            : parameters.operation.type === "setTtl"
              ? wrapper.canSetTtl
              : parameters.operation.type === "createSubname"
                ? wrapper.canCreateSubname
                : parameters.operation.type === "transfer"
                  ? wrapper.canTransfer
                  : true;

        return {
          account: parameters.account,
          operation: parameters.operation,
          target,
          authorization:
            wrapper.canModify && fuseAllows
              ? { status: "authorized", source: "wrapper-permission" }
              : { status: "unauthorized", requirement: { kind: "wrapper-permission" } },
          blockers: fuseAllows ? [] : ["WRAPPER_FUSE"],
        } as const satisfies RequiredAuthorizationResult;
      }

      if (target.kind === "wrapper-registry" && parameters.operation.type === "transfer") {
        const manager = yield* getManager.effect(config, parameters);
        const wrapper = yield* getWrapperPermissions.effect(config, parameters);

        const transferRole =
          manager === null
            ? null
            : yield* hasRegistryRoles.effect(config, {
                ...parameters,
                account: manager,
                roles: registryRoles.canTransferAdmin,
              });

        const transferAllowed = transferRole?.supported === true && transferRole.authorized;
        const ownerAuthorized = manager?.toLowerCase() === parameters.account.toLowerCase();

        const operatorAuthorized =
          wrapper.supported && wrapper.protocol === "v2" && wrapper.operatorApproved;

        return {
          account: parameters.account,
          operation: parameters.operation,
          target,
          authorization: ownerAuthorized
            ? { status: "authorized", source: "owner" }
            : operatorAuthorized
              ? { status: "authorized", source: "operator-approval" }
              : { status: "unauthorized", requirement: { kind: "owner" } },
          blockers: transferAllowed ? [] : ["TRANSFER_ROLE"],
        } as const satisfies RequiredAuthorizationResult;
      }

      const manager = yield* getManager.effect(config, parameters);

      const registrant =
        target.kind === "registrar" ? yield* getRegistrant.effect(config, parameters) : null;

      const controllingOwner = target.kind === "registrar" ? registrant : manager;
      const ownerAuthorized = controllingOwner?.toLowerCase() === parameters.account.toLowerCase();

      const approvals =
        controllingOwner === null
          ? null
          : yield* getOperatorApproval.effect(config, {
              ...parameters,
              owner: controllingOwner,
              operator: parameters.account,
            });

      const targetKind = target.kind === "registrar" ? "registrar" : "registry";

      const operatorAuthorized =
        approvals?.targets.some((approval) => approval.kind === targetKind && approval.approved) ??
        false;

      const tokenApproval =
        target.kind === "registrar" ? yield* getTokenApproval.effect(config, parameters) : null;

      const tokenAuthorized =
        tokenApproval?.supported === true &&
        tokenApproval.approved?.toLowerCase() === parameters.account.toLowerCase();

      const role = target.protocol === "v2" ? registryRoleFor(parameters.operation) : null;

      const roleResult =
        role === null
          ? null
          : yield* hasRegistryRoles.effect(config, { ...parameters, roles: role });

      const roleAuthorized = roleResult?.supported === true && roleResult.authorized;

      const transferRole =
        target.protocol === "v2" && parameters.operation.type === "transfer" && manager !== null
          ? yield* hasRegistryRoles.effect(config, {
              ...parameters,
              account: manager,
              roles: registryRoles.canTransferAdmin,
            })
          : null;

      const transferAllowed =
        transferRole === null || (transferRole.supported === true && transferRole.authorized);

      const authorization: AuthorizationDecision = ownerAuthorized
        ? ({ status: "authorized", source: "owner" } as const)
        : operatorAuthorized
          ? ({ status: "authorized", source: "operator-approval" } as const)
          : tokenAuthorized
            ? ({ status: "authorized", source: "token-approval" } as const)
            : roleAuthorized
              ? ({ status: "authorized", source: "registry-role" } as const)
              : ({
                  status: "unauthorized",
                  requirement:
                    roleResult?.supported === true
                      ? {
                          kind: "registry-role",
                          roles: roleResult.roles,
                          resource: roleResult.resource,
                        }
                      : { kind: "owner" },
                } as const);

      return {
        account: parameters.account,
        operation: parameters.operation,
        target,
        authorization,
        blockers: transferAllowed ? [] : ["TRANSFER_ROLE"],
      } satisfies RequiredAuthorizationResult;
    }),
  );
});

export const getRequiredAuthorization = defineReadAction<
  GetRequiredAuthorizationParameters,
  RequiredAuthorizationResult,
  CapabilityError
>(getRequiredAuthorizationEffect);

export type {
  AuthorizationRequirement,
  CapabilityError as GetRequiredAuthorizationError,
  RequiredAuthorizationResult,
} from "../types.js";
