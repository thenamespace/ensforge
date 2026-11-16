import { Effect } from "effect";

import {
  publicResolverV1IsApprovedForAbi,
  publicResolverV1IsApprovedForAllAbi,
  permissionedResolverV2InterfaceHasRolesAbi,
  publicResolverV2CanModifyNameAbi,
} from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import {
  resolverRecordPart,
  resolverRecordRole,
  resolverResource,
} from "../../../internal/capabilities/resolver-resource.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import { getManager } from "../../name/get-manager/index.js";
import { getResolverCapabilities } from "../get-resolver-capabilities/index.js";
import type {
  CapabilityError,
  NameCapabilityParameters,
  RecordOperation,
  RecordPermission,
  RecordPermissionsResult,
  ResolverProfiles,
} from "../types.js";

export type GetRecordPermissionsParameters = NameCapabilityParameters & {
  readonly account: EthereumAddress;
  readonly records: ReadonlyArray<RecordOperation>;
};

const profileSupported = (profiles: ResolverProfiles, record: RecordOperation): boolean => {
  switch (record.type) {
    case "address":
      return profiles.address;
    case "text":
      return profiles.text;
    case "contentHash":
      return profiles.contentHash;
    case "abi":
      return profiles.abi;
    case "pubkey":
      return profiles.pubkey;
    case "interface":
      return profiles.interface;
    case "name":
      return profiles.name;
    case "data":
      return profiles.data;
    case "dnsRecord":
      return profiles.dnsRecord;
    case "dnsZone":
      return profiles.dnsZone;
    case "alias":
      return false;
    case "clear":
      return true;
  }
};

const getRecordPermissionsEffect = Effect.fn("ensforge.getRecordPermissions")(function* (
  config: EnsforgeConfig,
  parameters: GetRecordPermissionsParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const resolver = yield* getResolverCapabilities.effect(config, parameters);

      if (resolver.address === null) {
        return {
          resolver: null,
          inherited: false,
          account: parameters.account,
          records: parameters.records.map((record): RecordPermission => ({
            record,
            supported: false,
            authorization: {
              status: "unauthorized",
              requirement: { kind: "unsupported" },
            },
            requiredRole: resolverRecordRole(record),
            resource: null,
          })),
        } satisfies RecordPermissionsResult;
      }

      const ethereum = yield* EthereumClient;
      const resolverAddress = resolver.address;
      const permissioned = resolver.authorization === "role";

      const manager =
        resolver.authorization === "owner-delegate"
          ? yield* getManager.effect(config, parameters)
          : null;

      let ownerAuthorized = false;
      let operatorAuthorized = false;
      let delegateAuthorized = false;

      if (resolver.authorization === "owner-delegate" && manager !== null) {
        ownerAuthorized = manager.toLowerCase() === parameters.account.toLowerCase();
        [operatorAuthorized, delegateAuthorized] = yield* Effect.all(
          [
            ethereum
              .readContract({
                address: resolverAddress,
                abi: publicResolverV1IsApprovedForAllAbi,
                functionName: "isApprovedForAll",
                args: [manager, parameters.account],
              })
              .pipe(Effect.catchTag("ContractError", () => Effect.succeed(false))),
            ethereum
              .readContract({
                address: resolverAddress,
                abi: publicResolverV1IsApprovedForAbi,
                functionName: "isApprovedFor",
                args: [manager, namehash(name), parameters.account],
              })
              .pipe(Effect.catchTag("ContractError", () => Effect.succeed(false))),
          ] as const,
          { concurrency: "unbounded" },
        );

        const profile = config.deployments;

        if (
          profile.protocol === "v2" &&
          resolverAddress.toLowerCase() === profile.v2.contracts.publicResolver.toLowerCase()
        ) {
          const canModify = yield* ethereum.readContract({
            address: resolverAddress,
            abi: publicResolverV2CanModifyNameAbi,
            functionName: "canModifyName",
            args: [namehash(name), parameters.account],
          });

          ownerAuthorized &&= canModify;
          operatorAuthorized &&= canModify;
          delegateAuthorized &&= canModify;
        }
      }

      const records = yield* Effect.forEach(
        parameters.records,
        Effect.fn("ensforge.getRecordPermissions.record")(function* (record) {
          const supported =
            record.type === "alias"
              ? resolver.permissioned
              : record.type === "clear" && permissioned
                ? false
                : profileSupported(resolver.profiles, record);

          const requiredRole = resolverRecordRole(record);

          if (!supported) {
            return {
              record,
              supported,
              authorization: {
                status: "unauthorized",
                requirement: { kind: "unsupported" },
              },
              requiredRole,
              resource: null,
            } as const satisfies RecordPermission;
          }

          if (resolver.authorization === "unknown") {
            return {
              record,
              supported,
              authorization: { status: "unknown", reason: "CUSTOM_RESOLVER" },
              requiredRole,
              resource: null,
            } as const satisfies RecordPermission;
          }

          if (!permissioned) {
            const source = ownerAuthorized
              ? "owner"
              : operatorAuthorized
                ? "operator-approval"
                : delegateAuthorized
                  ? "resolver-delegate"
                  : "none";

            return {
              record,
              supported,
              authorization:
                source === "none"
                  ? {
                      status: "unauthorized",
                      requirement: { kind: "resolver-delegate" },
                    }
                  : { status: "authorized", source },
              requiredRole,
              resource: null,
            } as const satisfies RecordPermission;
          }

          const part = resolverRecordPart(record);
          const node = namehash(name);
          const exact = record.type === "alias" ? 0n : resolverResource(node, part);

          const resources = exact === 0n ? [0n] : [exact, 0n];

          const checks = yield* Effect.all(
            resources.map((resource) =>
              ethereum.readContract({
                address: resolverAddress,
                abi: permissionedResolverV2InterfaceHasRolesAbi,
                functionName: "hasRoles",
                args: [resource, requiredRole, parameters.account],
              }),
            ),
            { concurrency: "unbounded" },
          );

          const authorized = checks.some(Boolean);

          return {
            record,
            supported,
            authorization: authorized
              ? { status: "authorized", source: "resolver-role" }
              : {
                  status: "unauthorized",
                  requirement: { kind: "resolver-role", roles: requiredRole, resource: exact },
                },
            requiredRole,
            resource: exact,
          } as const satisfies RecordPermission;
        }),
        { concurrency: "unbounded" },
      );

      return {
        resolver: resolverAddress,
        inherited: resolver.inherited,
        account: parameters.account,
        records,
      } satisfies RecordPermissionsResult;
    }),
  );
});

export const getRecordPermissions = defineReadAction<
  GetRecordPermissionsParameters,
  RecordPermissionsResult,
  CapabilityError
>(getRecordPermissionsEffect);

export type {
  CapabilityError as GetRecordPermissionsError,
  RecordPermission,
  RecordPermissionsResult,
} from "../types.js";
