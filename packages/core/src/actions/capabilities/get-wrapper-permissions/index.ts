import { Effect } from "effect";

import {
  nameWrapperV1CanExtendSubnamesAbi,
  nameWrapperV1CanModifyNameAbi,
  nameWrapperV1GetApprovedAbi,
  nameWrapperV1GetDataAbi,
  nameWrapperV1IsApprovedForAllAbi,
  nameWrapperV1IsWrappedAbi,
  permissionedRegistryV2InterfaceGetSubregistryAbi,
  wrapperRegistryV2InterfaceGetResourceAbi,
  wrapperRegistryV2InterfaceIsApprovedForAllAbi,
  wrapperRegistryV2InterfaceRolesAbi,
} from "@ensforge/contracts/internal";
import { nameWrapperFuses } from "@ensforge/contracts/v1";
import { registryInterfaceIds } from "@ensforge/contracts/v2";
import { isAddressEqual, zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { supportsInterface } from "../../../internal/capabilities/interface-support.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type {
  AccountCapabilityParameters,
  CapabilityError,
  WrapperPermissionsResult,
} from "../types.js";

const hasFuse = (fuses: number, fuse: number): boolean => (fuses & fuse) === fuse;

const getWrapperPermissionsEffect = Effect.fn("ensforge.getWrapperPermissions")(function* (
  config: EnsforgeConfig,
  parameters: AccountCapabilityParameters,
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
        const tokenId = BigInt(namehash(name));

        const wrapped = yield* ethereum.readContract({
          address: deployment.contracts.nameWrapper,
          abi: nameWrapperV1IsWrappedAbi,
          functionName: "isWrapped",
          args: [namehash(name)],
        });

        if (!wrapped) {
          return { supported: false, protocol: "v1", reason: "NAME_NOT_WRAPPED" } as const;
        }

        const [owner, fuses, expiry] = yield* ethereum.readContract({
          address: deployment.contracts.nameWrapper,
          abi: nameWrapperV1GetDataAbi,
          functionName: "getData",
          args: [tokenId],
        });

        const [approved, operatorApproved, canModify, canExtendSubnames] = yield* Effect.all(
          [
            ethereum.readContract({
              address: deployment.contracts.nameWrapper,
              abi: nameWrapperV1GetApprovedAbi,
              functionName: "getApproved",
              args: [tokenId],
            }),
            ethereum.readContract({
              address: deployment.contracts.nameWrapper,
              abi: nameWrapperV1IsApprovedForAllAbi,
              functionName: "isApprovedForAll",
              args: [owner, parameters.account],
            }),
            ethereum.readContract({
              address: deployment.contracts.nameWrapper,
              abi: nameWrapperV1CanModifyNameAbi,
              functionName: "canModifyName",
              args: [namehash(name), parameters.account],
            }),
            ethereum.readContract({
              address: deployment.contracts.nameWrapper,
              abi: nameWrapperV1CanExtendSubnamesAbi,
              functionName: "canExtendSubnames",
              args: [namehash(name), parameters.account],
            }),
          ] as const,
          { concurrency: "unbounded" },
        );

        return {
          supported: true,
          protocol: "v1",
          wrapper: deployment.contracts.nameWrapper,
          account: parameters.account,
          owner,
          tokenId,
          fuses,
          expiry,
          approved: isAddressEqual(approved, zeroAddress) ? null : approved,
          operatorApproved,
          canModify,
          canExtendSubnames,
          canUnwrap: !hasFuse(fuses, nameWrapperFuses.cannotUnwrap),
          canTransfer: !hasFuse(fuses, nameWrapperFuses.cannotTransfer),
          canSetResolver: !hasFuse(fuses, nameWrapperFuses.cannotSetResolver),
          canSetTtl: !hasFuse(fuses, nameWrapperFuses.cannotSetTtl),
          canCreateSubname: !hasFuse(fuses, nameWrapperFuses.cannotCreateSubdomain),
          canApprove: !hasFuse(fuses, nameWrapperFuses.cannotApprove),
        } as const;
      }

      const parentWrapped = yield* supportsInterface(
        route.parentRegistry,
        registryInterfaceIds.wrapperRegistry,
      );

      const childRegistry = parentWrapped
        ? route.parentRegistry
        : yield* ethereum.readContract({
            address: route.parentRegistry,
            abi: permissionedRegistryV2InterfaceGetSubregistryAbi,
            functionName: "getSubregistry",
            args: [route.label],
          });

      const childWrapped =
        parentWrapped || isAddressEqual(childRegistry, zeroAddress)
          ? parentWrapped
          : yield* supportsInterface(childRegistry, registryInterfaceIds.wrapperRegistry);

      if (!childWrapped) {
        return { supported: false, protocol: "v2", reason: "NAME_NOT_WRAPPED" } as const;
      }

      const anyId = parentWrapped ? route.state.tokenId : 0n;

      const [resource, roles] = yield* Effect.all(
        [
          ethereum.readContract({
            address: childRegistry,
            abi: wrapperRegistryV2InterfaceGetResourceAbi,
            functionName: "getResource",
            args: [anyId],
          }),
          ethereum.readContract({
            address: childRegistry,
            abi: wrapperRegistryV2InterfaceRolesAbi,
            functionName: "roles",
            args: [anyId, parameters.account],
          }),
        ] as const,
        { concurrency: "unbounded" },
      );

      const operatorApproved = parentWrapped
        ? yield* ethereum.readContract({
            address: childRegistry,
            abi: wrapperRegistryV2InterfaceIsApprovedForAllAbi,
            functionName: "isApprovedForAll",
            args: [route.state.latestOwner, parameters.account],
          })
        : false;

      return {
        supported: true,
        protocol: "v2",
        wrapper: childRegistry,
        account: parameters.account,
        resource,
        roles,
        operatorApproved,
      } as const;
    }),
  );
});

export const getWrapperPermissions = defineReadAction<
  AccountCapabilityParameters,
  WrapperPermissionsResult,
  CapabilityError
>(getWrapperPermissionsEffect);

export type {
  AccountCapabilityParameters as GetWrapperPermissionsParameters,
  CapabilityError as GetWrapperPermissionsError,
  WrapperPermissionsResult,
} from "../types.js";
