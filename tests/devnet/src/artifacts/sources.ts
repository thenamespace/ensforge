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
   * Mainnet runtime code at `address`, placed at the same address with `anvil_setCode`: canonical
   * singletons, and old ENS generations no source reproduces. `abi` names an artifact whose ABI
   * covers the code's functions. Needs `ENSFORGE_MAINNET_RPC_URL`.
   */
  | { readonly kind: "runtime"; readonly address: `0x${string}`; readonly abi?: string };

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
const defaultV2BuildInfo =
  "contracts/deployments/mainnet/build-info/solc-0_8_25-b30e6dc9a03b37f6a0b89af5d02a73d3993944f7.json";

const v2Build = (contract: string): Source => ({
  kind: "build",
  repository: "contracts-v2",
  buildInfo: defaultV2BuildInfo,
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
  // The 2020 controller that registered unwrapped names until the NameWrapper (recompiled by
  // ens-contracts; behaviour-equivalent to mainnet's 0x283A…).
  "v1/LegacyETHRegistrarController": {
    kind: "deployment",
    repository: "ens-contracts",
    file: "deployments/archive/ETHRegistrarController_mainnet_9380471.sol/ETHRegistrarController_mainnet_9380471.json",
  },

  // Older ENSv1 generations still observable on mainnet, at their mainnet addresses. Their
  // configuration is plain storage, so they work anywhere once the registries they name exist.
  "legacy/ENSRegistryOld": {
    kind: "runtime",
    address: "0x314159265dd8dbb310642f98f50c066173c1259b",
    abi: "v1/ENSRegistry",
  },
  "legacy/PublicResolver2017": {
    kind: "runtime",
    address: "0x1da022710dF5002339274AaDEe8D58218e9D6AB5",
    abi: "v1/PublicResolver",
  },
  "legacy/PublicResolver2018": {
    kind: "runtime",
    address: "0x5FfC014343cd971B7eb70732021E26C35B744cc4",
    abi: "v1/PublicResolver",
  },
  "legacy/PublicResolver2019": {
    kind: "runtime",
    address: "0x226159d592E2b063810a10Ebf6dcbADA94Ed68b8",
    abi: "v1/PublicResolver",
  },
  "legacy/PublicResolver2020Jan": {
    kind: "runtime",
    address: "0xDaaF96c344f63131acadD0Ea35170E7892d3dfBA",
    abi: "v1/PublicResolver",
  },
  "legacy/PublicResolver2020Feb": {
    kind: "runtime",
    address: "0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41",
    abi: "v1/PublicResolver",
  },
  "legacy/ReverseRegistrar2017": {
    kind: "runtime",
    address: "0x9062C0A6Dbd6108336BcBe4593a3D1cE05512069",
    abi: "v1/ReverseRegistrar",
  },
  "legacy/DefaultReverseResolver2017": {
    kind: "runtime",
    address: "0x5fBb459C49BB06083C33109fA4f14810eC2Cf358",
    abi: "v1/PublicResolver",
  },
  "legacy/ReverseRegistrar2020": {
    kind: "runtime",
    address: "0x084b1c3C81545d370f3634392De611CaaBFf8148",
    abi: "v1/ReverseRegistrar",
  },
  "legacy/DefaultReverseResolver2020": {
    kind: "runtime",
    address: "0xA2C122BE93b0074270ebeE7f6b7292C7deB45047",
    abi: "v1/PublicResolver",
  },

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

  // Sepolia's builds where they differ from mainnet's (older resolution and WrapperRegistry
  // semantics), for the `sepolia-shaped` profile.
  "sepolia/UniversalHelper": v2Deployment("sepolia/UniversalHelper.json"),
  "sepolia/ENSV2Resolver": v2Deployment("sepolia/ENSV2Resolver.json"),
  "sepolia/PublicResolverV2": v2Deployment("sepolia/PublicResolverV2.json"),
  "sepolia/UniversalResolverV2": v2Deployment("sepolia/UniversalResolverV2.json"),
  "sepolia/WrapperRegistryImpl": v2Deployment("sepolia/WrapperRegistryImpl.json"),
  "sepolia/LockedMigrationController": v2Deployment("sepolia/LockedMigrationController.json"),
  "sepolia/MigrationHelper": v2Deployment("sepolia/MigrationHelper.json"),
  "sepolia/DNSTLDResolver": v2Deployment("sepolia/DNSTLDResolver.json"),
  "sepolia/DNSAliasResolver": v2Deployment("sepolia/DNSAliasResolver.json"),
  "sepolia/HCAOwnerAndSessionValidator": v2Deployment("sepolia/HCAOwnerAndSessionValidator.json"),

  // Behaviour mocks from the pinned ENS test suites, for states no real contract is in.
  "mocks/DummyShapeshiftResolver": v2Build(
    `${ensContracts}/universalResolver/mocks/DummyShapeshiftResolver.sol:DummyShapeshiftResolver`,
  ),
  "mocks/MockOffchainResolver": v2Build(
    `${ensContracts}/test/mocks/MockOffchainResolver.sol:MockOffchainResolver`,
  ),
  "mocks/DummyExtendedDNSSECResolver": v2Build(
    `${ensContracts}/dnsregistrar/mocks/DummyExtendedDNSSECResolver.sol:DummyExtendedDNSSECResolver`,
  ),
  "mocks/DummyNonCCIPAwareResolver": v2Build(
    `${ensContracts}/dnsregistrar/mocks/DummyNonCCIPAwareResolver.sol:DummyNonCCIPAwareResolver`,
  ),
  "mocks/DummyLegacyTextResolver": v2Build(
    `${ensContracts}/dnsregistrar/mocks/DummyLegacyTextResolver.sol:DummyLegacyTextResolver`,
  ),
  "mocks/MockSmartContractWallet": v2Build(
    `${ensContracts}/test/mocks/MockSmartContractWallet.sol:MockSmartContractWallet`,
  ),
  "mocks/MockERC6492WalletFactory": v2Build(
    `${ensContracts}/test/mocks/MockERC6492WalletFactory.sol:MockERC6492WalletFactory`,
  ),
  "mocks/ERC1155ReceiverMock": v2Build(
    `${ensContracts}/wrapper/mocks/ERC1155ReceiverMock.sol:ERC1155ReceiverMock`,
  ),
  "mocks/TestNameWrapperReentrancy": v2Build(
    `${ensContracts}/wrapper/test/TestNameWrapperReentrancy.sol:TestNameWrapperReentrancy`,
  ),
  "mocks/NameGriefer": v2Build(`${ensContracts}/wrapper/test/NameGriefer.sol:NameGriefer`),
  "mocks/MockOwnable": v2Build(`${ensContracts}/test/mocks/MockOwnable.sol:MockOwnable`),
  "mocks/MockERC20Blacklist": v2Build("project/test/mocks/MockERC20.sol:MockERC20Blacklist"),
  "mocks/MockERC20VoidReturn": v2Build("project/test/mocks/MockERC20.sol:MockERC20VoidReturn"),
  "mocks/MockERC20FalseReturn": v2Build("project/test/mocks/MockERC20.sol:MockERC20FalseReturn"),
  // Not in the mainnet build; compiled on it from the v1.0.1 tree.
  "mocks/MockRevertingRegistry": {
    kind: "build",
    repository: "contracts-v2",
    buildInfo: defaultV2BuildInfo,
    contract: "project/test/mocks/MockRevertingRegistry.sol:MockRevertingRegistry",
    add: {
      "project/test/mocks/MockRevertingRegistry.sol":
        "contracts/test/mocks/MockRevertingRegistry.sol",
    },
  },
  "mocks/HostileContract": {
    kind: "local",
    file: "HostileContract.sol",
    contract: "HostileContract",
  },
  "mocks/AvatarToken": {
    kind: "local",
    file: "AvatarToken.sol",
    contract: "AvatarToken",
  },
  "mocks/OffchainWriteResolver": {
    kind: "local",
    file: "OffchainWriteResolver.sol",
    contract: "OffchainWriteResolver",
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
