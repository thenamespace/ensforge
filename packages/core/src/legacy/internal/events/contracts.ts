import {
  baseRegistrarV1Abi,
  ensRegistryV1Abi,
  ethRegistrarControllerV1Abi,
  nameWrapperV1Abi,
  publicResolverV1Abi,
} from "@ensforge/contracts/v1";
import {
  ethRegistrarV2Abi,
  permissionedRegistryV2Abi,
  permissionedResolverV2Abi,
  publicResolverV2Abi,
  lockedMigrationControllerV2Abi,
  unlockedMigrationControllerV2Abi,
} from "@ensforge/contracts/v2";
import type { Abi, Address } from "viem";

import type { EnsEventContractKind } from "../../actions/events/types.js";
import type { EnsDeploymentProfile } from "../../config/config.js";
import type { EnsProtocol } from "../../schemas/protocol.js";

export interface EnsEventContract {
  readonly address: Address;
  readonly abi: Abi;
  readonly protocol: EnsProtocol;
  readonly kind: EnsEventContractKind;
}

export const getEnsEventContracts = (
  profile: EnsDeploymentProfile,
): ReadonlyArray<EnsEventContract> => {
  const v1 = profile.v1;
  const contracts: Array<EnsEventContract> = [];

  if (v1 !== undefined) {
    contracts.push(
      {
        address: v1.contracts.ethRegistrarController,
        abi: ethRegistrarControllerV1Abi,
        protocol: "v1",
        kind: "registrar",
      },
      {
        address: v1.contracts.baseRegistrar,
        abi: baseRegistrarV1Abi,
        protocol: "v1",
        kind: "registrar",
      },
      { address: v1.contracts.registry, abi: ensRegistryV1Abi, protocol: "v1", kind: "registry" },
      {
        address: v1.contracts.nameWrapper,
        abi: nameWrapperV1Abi,
        protocol: "v1",
        kind: "name-wrapper",
      },
      {
        address: v1.contracts.publicResolver,
        abi: publicResolverV1Abi,
        protocol: "v1",
        kind: "resolver",
      },
    );
  }

  if (profile.protocol === "v2") {
    contracts.push(
      {
        address: profile.v2.contracts.ethRegistrar,
        abi: ethRegistrarV2Abi,
        protocol: "v2",
        kind: "registrar",
      },
      {
        address: profile.v2.contracts.ethRegistry,
        abi: permissionedRegistryV2Abi,
        protocol: "v2",
        kind: "registry",
      },
      {
        address: profile.v2.contracts.publicResolver,
        abi: publicResolverV2Abi,
        protocol: "v2",
        kind: "resolver",
      },
      {
        address: profile.v2.contracts.ensV2Resolver,
        abi: permissionedResolverV2Abi,
        protocol: "v2",
        kind: "resolver",
      },
      {
        address: profile.v2.migration.unlockedMigrationController,
        abi: unlockedMigrationControllerV2Abi,
        protocol: "v2",
        kind: "migration-controller",
      },
      {
        address: profile.v2.migration.lockedMigrationController,
        abi: lockedMigrationControllerV2Abi,
        protocol: "v2",
        kind: "migration-controller",
      },
    );
  }

  return contracts;
};
