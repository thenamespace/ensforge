/**
 * Where every committed artifact comes from. `artifacts refresh` re-derives each one from these
 * pinned sources; `artifacts check` fails when a committed file no longer matches.
 */

export const repositories = {
  "ens-contracts": {
    url: "https://github.com/ensdomains/ens-contracts.git",
    tag: "v1.7.0",
    commit: "9b034936a42f462fc04bc0a929a419ede5e18d59",
  },
  "contracts-v2": {
    url: "https://github.com/ensdomains/contracts-v2.git",
    tag: "v1.0.1",
    commit: "5026725d2a927f84de3a3a34b5bfe6cb92ae7cbb",
  },
} as const;

export type Repository = keyof typeof repositories;

export type Source =
  /** Creation code and ABI from a deployment record (as deployed on mainnet). */
  | { readonly kind: "deployment"; readonly repository: Repository; readonly file: string }
  /**
   * Compiled from a build-info's standard-JSON input with its exact compiler, optionally with
   * extra source files from the same repository (`sourceName` → repository file).
   */
  | {
      readonly kind: "build";
      readonly repository: Repository;
      readonly buildInfo: string;
      readonly contract: string;
      readonly add?: Readonly<Record<string, string>>;
    }
  /** Our own contracts under `tests/devnet/contracts`, compiled with solc 0.8.27. */
  | { readonly kind: "local"; readonly file: string; readonly contract: string }
  /**
   * Mainnet runtime code at `address`, placed at the same address with `anvil_setCode`; for
   * contracts other software expects at canonical addresses. Needs `ENSFORGE_MAINNET_RPC_URL`.
   */
  | { readonly kind: "runtime"; readonly address: `0x${string}` };

const v1Deployment = (name: string): Source => ({
  kind: "deployment",
  repository: "ens-contracts",
  file: `deployments/mainnet/${name}.json`,
});

const v2Deployment = (file: string): Source => ({
  kind: "deployment",
  repository: "contracts-v2",
  file: `contracts/deployments/${file}`,
});

// contracts-v2's default mainnet build: v2 sources plus its pinned ens-contracts and test mocks.
const v2Build = (contract: string): Source => ({
  kind: "build",
  repository: "contracts-v2",
  buildInfo:
    "contracts/deployments/mainnet/build-info/solc-0_8_25-b30e6dc9a03b37f6a0b89af5d02a73d3993944f7.json",
  contract,
});

const ensContracts = "project/lib/ens-contracts/contracts";

/** Artifact name (its path under `artifacts/`, without `.json`) → source. */
export const sources = {
  // ENSv1 at ens-contracts v1.7.0, as deployed on mainnet. Contracts whose deployment records
  // carry no bytecode are compiled from the ens-contracts tree pinned by contracts-v2.
  "v1/ENSRegistry": v2Build(`${ensContracts}/registry/ENSRegistry.sol:ENSRegistry`),
  "v1/ENSRegistryWithFallback": v2Build(
    `${ensContracts}/registry/ENSRegistryWithFallback.sol:ENSRegistryWithFallback`,
  ),
  "v1/Root": v2Build(`${ensContracts}/root/Root.sol:Root`),
  "v1/RootSecurityController": v1Deployment("RootSecurityController"),
  "v1/ReverseRegistrar": v1Deployment("ReverseRegistrar"),
  "v1/BaseRegistrarImplementation": v2Build(
    `${ensContracts}/ethregistrar/BaseRegistrarImplementation.sol:BaseRegistrarImplementation`,
  ),
  "v1/RegistrarSecurityController": v1Deployment("RegistrarSecurityController"),
  "v1/OwnedResolver": v2Build(`${ensContracts}/resolvers/OwnedResolver.sol:OwnedResolver`),
  "v1/DummyOracle": v2Build(`${ensContracts}/ethregistrar/DummyOracle.sol:DummyOracle`),
  "v1/ExponentialPremiumPriceOracle": v1Deployment("ExponentialPremiumPriceOracle"),
  "v1/StaticMetadataService": v1Deployment("StaticMetadataService"),
  "v1/NameWrapper": v1Deployment("NameWrapper"),
  "v1/WrappedETHRegistrarController": v1Deployment("WrappedETHRegistrarController"),
  "v1/DefaultReverseRegistrar": v1Deployment("DefaultReverseRegistrar"),
  "v1/ETHRegistrarController": v1Deployment("ETHRegistrarController"),
  "v1/StaticBulkRenewal": v1Deployment("StaticBulkRenewal"),
  "v1/PublicResolver": v1Deployment("PublicResolver"),
  "v1/DefaultReverseResolver": v1Deployment("DefaultReverseResolver"),
  "v1/RSASHA1Algorithm": v1Deployment("RSASHA1Algorithm"),
  "v1/RSASHA256Algorithm": v1Deployment("RSASHA256Algorithm"),
  "v1/P256SHA256Algorithm": v1Deployment("P256SHA256Algorithm"),
  "v1/DummyAlgorithm": v2Build(
    `${ensContracts}/dnssec-oracle/algorithms/DummyAlgorithm.sol:DummyAlgorithm`,
  ),
  "v1/SHA1Digest": v1Deployment("SHA1Digest"),
  "v1/SHA256Digest": v1Deployment("SHA256Digest"),
  "v1/DummyDigest": v2Build(`${ensContracts}/dnssec-oracle/digests/DummyDigest.sol:DummyDigest`),
  "v1/DNSSECImpl": v1Deployment("DNSSECImpl"),
  "v1/OffchainDNSResolver": v1Deployment("OffchainDNSResolver"),
  "v1/SimplePublicSuffixList": v1Deployment("SimplePublicSuffixList"),
  "v1/DNSRegistrar": v1Deployment("DNSRegistrar"),
  "v1/ExtendedDNSResolver": v1Deployment("ExtendedDNSResolver"),
  "v1/BatchGatewayProvider": v1Deployment("BatchGatewayProvider"),
  "v1/UniversalResolver": v1Deployment("UniversalResolver"),
  "v1/MigrationHelper": v1Deployment("MigrationHelper"),

  // ENSv2 at contracts-v2 v1.0.1: the live mainnet build of each contract (some in `mainnet-adhoc`).
  "v2/ContractNamerImplementation": v2Deployment("mainnet/ContractNamer_Implementation.json"),
  "v2/ContractNamerProxy": v2Deployment("mainnet/ContractNamer_Proxy.json"),
  "v2/LabelStore": v2Deployment("mainnet/LabelStore.json"),
  "v2/ENSURIRenderer": v2Deployment("mainnet/ENSURIRenderer.json"),
  "v2/BoxedENSURIRenderer": v2Deployment("mainnet/BoxedENSURIRenderer.json"),
  "v2/VerifiableFactory": v2Deployment("mainnet/VerifiableFactory.json"),
  "v2/RegistryUpgradeSet": v2Deployment("mainnet/RegistryUpgradeSet.json"),
  "v2/RootRegistry": v2Deployment("mainnet/RootRegistry.json"),
  "v2/ETHRegistry": v2Deployment("mainnet/ETHRegistry.json"),
  "v2/DNSSECGatewayProvider": v2Deployment("mainnet/DNSSECGatewayProvider.json"),
  "v2/DNSTXTResolver": v2Deployment("mainnet/DNSTXTResolver.json"),
  "v2/ENSV1Resolver": v2Deployment("mainnet/ENSV1Resolver.json"),
  "v2/ENSV2Resolver": v2Deployment("mainnet/ENSV2Resolver.json"),
  "v2/DNSAliasResolver": v2Deployment("mainnet/DNSAliasResolver.json"),
  "v2/DNSTLDResolver": v2Deployment("mainnet-adhoc/DNSTLDResolver.json"),
  "v2/TemporaryDNSRegistrar": v2Deployment("mainnet-adhoc/TemporaryDNSRegistrar.json"),
  "v2/PermissionedResolverImpl": v2Deployment("mainnet/PermissionedResolverImpl.json"),
  "v2/UserRegistryImpl": v2Deployment("mainnet-adhoc/UserRegistryImpl.json"),
  "v2/Graveyard": v2Deployment("mainnet/Graveyard.json"),
  "v2/PublicResolverV2": v2Deployment("mainnet/PublicResolverV2.json"),
  "v2/PublicResolverSet": v2Deployment("mainnet/PublicResolverSet.json"),
  "v2/StandardRentPriceOracle": v2Deployment("mainnet/StandardRentPriceOracle.json"),
  "v2/ETHRegistrar": v2Deployment("mainnet/ETHRegistrar.json"),
  "v2/ETHRenewerV1": v2Deployment("mainnet/ETHRenewerV1.json"),
  "v2/UnlockedMigrationController": v2Deployment("mainnet/UnlockedMigrationController.json"),
  "v2/WrapperRegistryImpl": v2Deployment("mainnet/WrapperRegistryImpl.json"),
  "v2/LockedMigrationControllerImplementation": v2Deployment(
    "mainnet/LockedMigrationController_Implementation.json",
  ),
  "v2/LockedMigrationControllerProxy": v2Deployment("mainnet/LockedMigrationController_Proxy.json"),
  "v2/BatchRegistrar": v2Deployment("mainnet/BatchRegistrar.json"),
  "v2/MigrationHelper": v2Deployment("mainnet/MigrationHelper.json"),
  "v2/UniversalHelper": v2Deployment("mainnet/UniversalHelper.json"),
  "v2/UniversalResolverV1": v2Deployment("mainnet/UniversalResolverV1.json"),
  "v2/UniversalResolverV2": v2Deployment("mainnet/UniversalResolverV2.json"),
  "v2/UpgradableUniversalResolverProxy": v2Deployment(
    "mainnet/UpgradableUniversalResolverProxy.json",
  ),
  "v2/ManagedUniversalResolverProxy": v2Deployment("mainnet/ManagedUniversalResolverProxy.json"),
  "v2/DefaultReverseRegistrarAdapter": v2Deployment("mainnet/DefaultReverseRegistrarAdapter.json"),
  "v2/ReverseRegistrarAdapter": v2Deployment("mainnet/ReverseRegistrarAdapter.json"),
  "v2/MockERC20": v2Build("project/test/mocks/MockERC20.sol:MockERC20"),
  "v2/MockDNSSEC": v2Build("project/test/mocks/MockDNSSEC.sol:MockDNSSEC"),

  // HCA at contracts-v2 v1.0.1. The intent executor mock stands in for Rhinestone's executor and
  // gas-refund paymaster, as in upstream's local devnet.
  "hca/StandaloneHCAFactory": v2Deployment("mainnet/StandaloneHCAFactory.json"),
  "hca/HCAOwnerAndSessionValidator": v2Deployment("mainnet/HCAOwnerAndSessionValidator.json"),
  "hca/HCAUpgradeSet": v2Deployment("mainnet/HCAUpgradeSet.json"),
  "hca/StandaloneHCAImplementation": v2Deployment("mainnet/StandaloneHCAImplementation.json"),
  "hca/MockRegistrationIntentExecutor": {
    kind: "build",
    repository: "contracts-v2",
    buildInfo:
      // The Sepolia build that compiled an earlier version of this mock has all its imports.
      "contracts/deployments/sepolia-20260730-r1/build-info/solc-0_8_27-2da25a2437eac09dce5c3f816658f332e03c72a5.json",
    contract:
      "project/test/mocks/MockRegistrationIntentExecutor.sol:MockRegistrationIntentExecutor",
    add: {
      "project/test/mocks/MockRegistrationIntentExecutor.sol":
        "contracts/test/mocks/MockRegistrationIntentExecutor.sol",
    },
  },

  // Canonical singletons, placed at their mainnet addresses.
  "canonical/Multicall3": {
    kind: "runtime",
    address: "0xcA11bde05977b3631167028862bE2a173976CA11",
  },
  "canonical/EntryPointV07": {
    kind: "runtime",
    address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  },
  // EntryPoint v0.7 deploys accounts through this immutable SenderCreator.
  "canonical/SenderCreatorV07": {
    kind: "runtime",
    address: "0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C",
  },
  "canonical/Permit2": { kind: "runtime", address: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
} as const satisfies Record<string, Source>;

export type ArtifactName = keyof typeof sources;
