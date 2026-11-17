import type { Deployments } from "@ensforge/contracts";
import type { Address } from "viem";

import type { Ledger } from "../deploy/engine.ts";

/** The capabilities of the contracts-v2 builds live on mainnet, which the devnet deploys. */
export const mainnetCapabilities: Deployments.Capabilities = {
  resolutionErrorWrapping: true,
  wrapperRegistryInitializer: "fuse-derived",
  wrapperRegistryEmancipation: "role-derived",
  lockedMigrationRenewal: "max-expiry",
  userRegistryUpgradeGate: true,
  hcaSameChainSourceRejected: true,
  hcaSessionDomain: "smart-session",
  hcaContractOwners: false,
};

const reader =
  (ledger: Ledger) =>
  (key: string): Address => {
    const deployed = ledger.get(key);
    if (deployed === undefined) throw new Error(`${key} was not deployed by this profile`);
    return deployed.address;
  };

export const v1Deployment = (
  ledger: Ledger,
  chainId: number,
  status: Deployments.Status,
): Deployments.V1 => {
  const at = reader(ledger);
  return {
    id: "devnet-v1",
    chainId,
    protocol: "v1",
    status,
    contracts: {
      registry: at("v1.registry"),
      baseRegistrar: at("v1.baseRegistrar"),
      ethRegistrarController: at("v1.ethRegistrarController"),
      wrappedEthRegistrarController: at("v1.wrappedEthRegistrarController"),
      bulkRenewal: at("v1.bulkRenewal"),
      priceOracle: at("v1.priceOracle"),
      nameWrapper: at("v1.nameWrapper"),
      publicResolver: at("v1.publicResolver"),
      // With ENSv2 deployed, the public proxy resolves both protocols, as on mainnet.
      universalResolver: ledger.has("v2.universalResolver")
        ? at("v2.universalResolver")
        : at("v1.universalResolver"),
      reverseRegistrar: at("v1.reverseRegistrar"),
      defaultReverseRegistrar: at("v1.defaultReverseRegistrar"),
      dnsRegistrar: at("v1.dnsRegistrar"),
      dnssecOracle: at("v1.dnssecOracle"),
      offchainDnsResolver: at("v1.offchainDnsResolver"),
    },
    // Newest first, as in ensforge's mainnet profile (which also lists the 2023 resolver).
    legacyPublicResolvers: [at("legacy.publicResolver2020Feb"), at("legacy.publicResolver2020Jan")],
    frozenPublicResolvers: [
      at("legacy.publicResolver2019"),
      at("legacy.publicResolver2017"),
      at("legacy.publicResolver2018"),
    ],
  };
};

export const v2Deployment = (
  ledger: Ledger,
  chainId: number,
  capabilities: Deployments.Capabilities,
): Deployments.V2 => {
  const at = reader(ledger);
  return {
    id: "devnet-v2",
    chainId,
    protocol: "v2",
    status: "active",
    contracts: {
      universalResolver: at("v2.universalResolver"),
      universalHelper: at("v2.universalHelper"),
      rootRegistry: at("v2.rootRegistry"),
      ethRegistry: at("v2.ethRegistry"),
      ethRegistrar: at("v2.ethRegistrar"),
      rentPriceOracle: at("v2.rentPriceOracle"),
      ensV2Resolver: at("v2.ensV2Resolver"),
      publicResolver: at("v2.publicResolver"),
      verifiableFactory: at("v2.verifiableFactory"),
      labelStore: at("v2.labelStore"),
      contractNamer: at("v2.contractNamer"),
      reverseRegistrarAdapter: at("v2.reverseRegistrarAdapter"),
      defaultReverseRegistrarAdapter: at("v2.defaultReverseRegistrarAdapter"),
    },
    implementations: {
      universalResolver: at("v2.universalResolverImplementation"),
      universalResolverV1: at("v2.universalResolverV1"),
      permissionedResolver: at("v2.permissionedResolverImplementation"),
      userRegistry: at("v2.userRegistryImplementation"),
      wrapperRegistry: at("v2.wrapperRegistryImplementation"),
      contractNamer: at("v2.contractNamerImplementation"),
    },
    migration: {
      ensV1Resolver: at("v2.ensV1Resolver"),
      ethRenewerV1: at("v2.ethRenewerV1"),
      unlockedMigrationController: at("v2.unlockedMigrationController"),
      lockedMigrationController: at("v2.lockedMigrationController"),
      migrationHelper: at("v2.migrationHelper"),
      graveyard: at("v2.graveyard"),
      publicResolverSet: at("v2.publicResolverSet"),
      registryUpgradeSet: at("v2.registryUpgradeSet"),
    },
    infrastructure: {
      ensUriRenderer: at("v2.ensUriRenderer"),
      boxedEnsUriRenderer: at("v2.boxedEnsUriRenderer"),
      managedUniversalResolverProxy: at("v2.managedUniversalResolverProxy"),
      batchRegistrar: at("v2.batchRegistrar"),
      rootBatchRegistrar: at("v2.rootBatchRegistrar"),
    },
    dns: {
      tldResolver: at("v2.dnsTldResolver"),
      aliasResolver: at("v2.dnsAliasResolver"),
      txtResolver: at("v2.dnsTxtResolver"),
      gatewayProvider: at("v2.dnssecGatewayProvider"),
      temporaryRegistrar: at("v2.temporaryDnsRegistrar"),
    },
    hca: {
      ownerAndSessionValidator: at("hca.ownerAndSessionValidator"),
      upgradeSet: at("hca.upgradeSet"),
      standaloneFactory: at("hca.standaloneFactory"),
      standaloneImplementation: at("hca.standaloneImplementation"),
      entryPoint: at("canonical.entryPoint"),
      intentExecutor: at("hca.intentExecutor"),
      gasRefundPaymaster: at("hca.intentExecutor"),
    },
    paymentTokens: { dai: at("v2.dai"), usdc: at("v2.usdc") },
    capabilities,
  };
};
