import { Schema } from "effect";

import { EthereumAddress } from "../../schemas/identity.js";

const metadata = {
  status: Schema.optionalKey(Schema.Literals(["active", "beta", "legacy"])),
  provenance: Schema.optionalKey(
    Schema.Struct({
      repository: Schema.String,
      release: Schema.String,
      commit: Schema.String,
      builds: Schema.optionalKey(
        Schema.Struct({
          default: Schema.String,
          overrides: Schema.Record(Schema.String, Schema.String),
        }),
      ),
      documentation: Schema.optionalKey(Schema.String),
    }),
  ),
};

const EnsV1ContractAddresses = Schema.Struct({
  registry: EthereumAddress,
  baseRegistrar: EthereumAddress,
  ethRegistrarController: EthereumAddress,
  wrappedEthRegistrarController: Schema.optionalKey(EthereumAddress),
  bulkRenewal: EthereumAddress,
  priceOracle: EthereumAddress,
  nameWrapper: EthereumAddress,
  publicResolver: EthereumAddress,
  universalResolver: EthereumAddress,
  reverseRegistrar: EthereumAddress,
  defaultReverseRegistrar: EthereumAddress,
  dnsRegistrar: EthereumAddress,
  dnssecOracle: EthereumAddress,
  offchainDnsResolver: EthereumAddress,
});

const EnsV2PublicContractAddresses = Schema.Struct({
  universalResolver: EthereumAddress,
  universalHelper: EthereumAddress,
  rootRegistry: EthereumAddress,
  ethRegistry: EthereumAddress,
  ethRegistrar: EthereumAddress,
  rentPriceOracle: EthereumAddress,
  ensV2Resolver: EthereumAddress,
  publicResolver: EthereumAddress,
  verifiableFactory: EthereumAddress,
  labelStore: EthereumAddress,
  contractNamer: EthereumAddress,
  reverseRegistrarAdapter: EthereumAddress,
  defaultReverseRegistrarAdapter: EthereumAddress,
});

const EnsV2ImplementationAddresses = Schema.Struct({
  universalResolver: EthereumAddress,
  universalResolverV1: Schema.optionalKey(EthereumAddress),
  permissionedResolver: EthereumAddress,
  userRegistry: EthereumAddress,
  wrapperRegistry: EthereumAddress,
  contractNamer: EthereumAddress,
});

const EnsV2MigrationContractAddresses = Schema.Struct({
  ensV1Resolver: EthereumAddress,
  ethRenewerV1: EthereumAddress,
  unlockedMigrationController: EthereumAddress,
  lockedMigrationController: EthereumAddress,
  migrationHelper: EthereumAddress,
  graveyard: EthereumAddress,
  publicResolverSet: EthereumAddress,
  registryUpgradeSet: EthereumAddress,
});

const EnsV2InfrastructureContractAddresses = Schema.Struct({
  managedUniversalResolverProxy: Schema.optionalKey(EthereumAddress),
  batchRegistrar: EthereumAddress,
  rootBatchRegistrar: EthereumAddress,
});

const EnsV2DnsContractAddresses = Schema.Struct({
  tldResolver: EthereumAddress,
  aliasResolver: EthereumAddress,
  txtResolver: EthereumAddress,
  gatewayProvider: EthereumAddress,
  temporaryRegistrar: Schema.optionalKey(EthereumAddress),
});

const EnsV2Capabilities = Schema.Struct({
  resolutionErrorWrapping: Schema.Boolean,
  wrapperRegistryInitializer: Schema.Literals(["explicit", "fuse-derived"]),
  wrapperRegistryEmancipation: Schema.Literals(["static", "role-derived"]),
  lockedMigrationRenewal: Schema.Literals(["renew-role", "max-expiry"]),
  userRegistryUpgradeGate: Schema.Boolean,
  hcaSameChainSourceRejected: Schema.Boolean,
});

const EnsV2HcaContractAddresses = Schema.Struct({
  ownerAndSessionValidator: EthereumAddress,
  upgradeSet: EthereumAddress,
  standaloneFactory: EthereumAddress,
  standaloneImplementation: EthereumAddress,
});

const EnsV2TestTokenAddresses = Schema.Struct({
  dai: EthereumAddress,
  usdc: EthereumAddress,
});

const v1 = Schema.Struct({
  ...metadata,
  contracts: EnsV1ContractAddresses,
});

const v2 = Schema.Struct({
  ...metadata,
  contracts: EnsV2PublicContractAddresses,
  implementations: EnsV2ImplementationAddresses,
  migration: EnsV2MigrationContractAddresses,
  infrastructure: EnsV2InfrastructureContractAddresses,
  dns: Schema.optionalKey(EnsV2DnsContractAddresses),
  hca: Schema.optionalKey(EnsV2HcaContractAddresses),
  testTokens: Schema.optionalKey(EnsV2TestTokenAddresses),
  capabilities: EnsV2Capabilities,
});

const identity = {
  id: Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/))),
  chainId: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)),
  ),
};

export const CustomEnsNetworkSchema = Schema.Union([
  Schema.Struct({
    ...identity,
    protocol: Schema.Literal("v1"),
    v1,
    v2: Schema.optionalKey(Schema.Never),
  }),
  Schema.Struct({ ...identity, protocol: Schema.Literal("v2"), v1: Schema.optionalKey(v1), v2 }),
]);
