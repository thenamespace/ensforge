import type { Address } from "viem";

/**
 * Lifecycle of a deployment: `active` is the current protocol on that chain, `legacy` is kept for
 * compatibility and migration, `beta` is not yet recommended for production names.
 *
 * @since 1.0.0
 */
export type Status = "active" | "beta" | "legacy";

/**
 * Where the addresses of a deployment come from.
 *
 * @since 1.0.0
 */
export interface Provenance {
  /** Source repository of the deployed contracts. */
  readonly repository: string;
  /** Release tag the addresses were taken from, e.g. `v1.0.1`. */
  readonly release: string;
  /** Commit of the release tag. */
  readonly commit: string;
  /**
   * Compiler builds of the live contracts. ENSv2 networks mix builds because contracts were
   * redeployed individually; `overrides` maps contracts-v2 deployment names to their build.
   */
  readonly builds?: {
    readonly default: string;
    readonly overrides: Readonly<Record<string, string>>;
  };
  /** Human-readable deployment documentation. */
  readonly documentation?: string;
}

/**
 * ENSv1 contract addresses.
 *
 * @since 1.0.0
 */
export interface V1Contracts {
  /** ENS registry. */
  readonly registry: Address;
  /** `.eth` ERC-721 registrar. */
  readonly baseRegistrar: Address;
  /** Current `.eth` registrar controller. */
  readonly ethRegistrarController: Address;
  /** Previous `.eth` controller that registers names directly into the NameWrapper. */
  readonly wrappedEthRegistrarController?: Address;
  /** Batch renewal helper. */
  readonly bulkRenewal: Address;
  /** `.eth` rent price oracle. */
  readonly priceOracle: Address;
  /** NameWrapper (ERC-1155 wrapped names and fuses). */
  readonly nameWrapper: Address;
  /** Current public resolver. */
  readonly publicResolver: Address;
  /** Universal Resolver proxy. */
  readonly universalResolver: Address;
  /** Reverse registrar for `addr.reverse`. */
  readonly reverseRegistrar: Address;
  /** Reverse registrar for `default.reverse`. */
  readonly defaultReverseRegistrar: Address;
  /** DNSSEC registrar for DNS names. */
  readonly dnsRegistrar: Address;
  /** DNSSEC oracle. */
  readonly dnssecOracle: Address;
  /** Off-chain DNS resolver (gasless DNSSEC). */
  readonly offchainDnsResolver: Address;
}

/**
 * An ENSv1 deployment.
 *
 * @since 1.0.0
 */
export interface V1 {
  /** Stable identifier, e.g. `mainnet-v1`. */
  readonly id: string;
  readonly chainId: number;
  readonly protocol: "v1";
  readonly status: Status;
  readonly contracts: V1Contracts;
  readonly provenance?: Provenance;
}

/**
 * ENSv2 entry points that applications call directly.
 *
 * @since 1.0.0
 */
export interface V2Contracts {
  /** Public Universal Resolver proxy (`0xeeee…eeee` on mainnet and Sepolia). */
  readonly universalResolver: Address;
  /** Batched read helper for registries, resolvers and names. */
  readonly universalHelper: Address;
  /** Root registry holding top-level names. */
  readonly rootRegistry: Address;
  /** Registry holding second-level `.eth` names. */
  readonly ethRegistry: Address;
  /** Commit-reveal `.eth` registrar. */
  readonly ethRegistrar: Address;
  /** `.eth` rent price oracle. */
  readonly rentPriceOracle: Address;
  /** Resolver that resolves through the ENSv2 registry tree. */
  readonly ensV2Resolver: Address;
  /** Shared public resolver. */
  readonly publicResolver: Address;
  /** Factory for per-name user registries and per-user resolvers. */
  readonly verifiableFactory: Address;
  /** Label hash to label store. */
  readonly labelStore: Address;
  /** Reverse-name setter for ENSv2 contracts (proxy). */
  readonly contractNamer: Address;
  /** Ethereum primary name adapter. */
  readonly reverseRegistrarAdapter: Address;
  /** Default (chain-independent) primary name adapter. */
  readonly defaultReverseRegistrarAdapter: Address;
}

/**
 * ENSv2 implementation contracts that proxies and factory deployments point to.
 *
 * @since 1.0.0
 */
export interface V2Implementations {
  /** Universal Resolver implementation behind the managed proxy. */
  readonly universalResolver: Address;
  /** ENSv1-only Universal Resolver implementation kept as a fallback target. */
  readonly universalResolverV1?: Address;
  /** PermissionedResolver implementation for factory-deployed resolvers. */
  readonly permissionedResolver: Address;
  /** UserRegistry implementation for factory-deployed subname registries. */
  readonly userRegistry: Address;
  /** WrapperRegistry implementation for migrated NameWrapper names. */
  readonly wrapperRegistry: Address;
  /** ContractNamer implementation. */
  readonly contractNamer: Address;
}

/**
 * ENSv1 to ENSv2 migration contracts.
 *
 * @since 1.0.0
 */
export interface V2Migration {
  /** Resolver that forwards unmigrated names to ENSv1. */
  readonly ensV1Resolver: Address;
  /** Renewal controller for unmigrated ENSv1 `.eth` names. */
  readonly ethRenewerV1: Address;
  /** Migration controller for unlocked names. */
  readonly unlockedMigrationController: Address;
  /** Migration controller for locked NameWrapper names (a proxy on mainnet). */
  readonly lockedMigrationController: Address;
  /** Batched migration helper. */
  readonly migrationHelper: Address;
  /** Holder of retired ENSv1 tokens. */
  readonly graveyard: Address;
  /** Set of resolvers treated as public resolvers during migration. */
  readonly publicResolverSet: Address;
  /** Set of registry implementations user registries may upgrade to. */
  readonly registryUpgradeSet: Address;
}

/**
 * ENSv2 supporting infrastructure.
 *
 * @since 1.0.0
 */
export interface V2Infrastructure {
  /** Static token URI renderer. */
  readonly ensUriRenderer?: Address;
  /** Token URI renderer for boxed registries. */
  readonly boxedEnsUriRenderer?: Address;
  /** ENS-managed Universal Resolver proxy behind the public proxy. */
  readonly managedUniversalResolverProxy?: Address;
  /** Batch registration helper for `.eth`. */
  readonly batchRegistrar: Address;
  /** Batch registration helper for the root registry. */
  readonly rootBatchRegistrar: Address;
}

/**
 * ENSv2 DNS integration contracts.
 *
 * @since 1.0.0
 */
export interface V2Dns {
  /** Resolver for DNS top-level domains. */
  readonly tldResolver: Address;
  /** Resolver mapping DNS names onto ENS names through TXT aliases. */
  readonly aliasResolver: Address;
  /** Resolver answering from `ENS1` TXT records. */
  readonly txtResolver: Address;
  /** Gateway provider for DNSSEC proofs. */
  readonly gatewayProvider: Address;
  /** Registrar that claims DNS names into ENSv2 (mainnet only). */
  readonly temporaryRegistrar?: Address;
}

/**
 * Hosted contract account (HCA) contracts.
 *
 * @since 1.0.0
 */
export interface V2Hca {
  /** Owner signature and session key validator. */
  readonly ownerAndSessionValidator: Address;
  /** Set of approved HCA implementation upgrades. */
  readonly upgradeSet: Address;
  /** Standalone HCA factory. */
  readonly standaloneFactory: Address;
  /** Single-owner standalone HCA implementation. */
  readonly standaloneImplementation: Address;
}

/**
 * ERC-20 test tokens accepted by testnet registrars.
 *
 * @since 1.0.0
 */
export interface V2TestTokens {
  readonly dai: Address;
  readonly usdc: Address;
}

/**
 * Behaviour that differs between ENSv2 deployments of the same release. SDK code branches on
 * these flags instead of on the chain.
 *
 * @since 1.0.0
 */
export interface Capabilities {
  /**
   * Resolution contracts wrap registry reverts in `ResolutionError(address,bytes)` and reject
   * foreign `OffchainLookup` senders with `InvalidOffchainLookup()`.
   */
  readonly resolutionErrorWrapping: boolean;
  /**
   * How WrapperRegistry `initialize` receives its label and roles: passed `explicit`ly
   * (`initialize(bytes32,address,string,uint256)`) or `fuse-derived` from NameWrapper fuses
   * (`initialize(bytes32,address)`).
   */
  readonly wrapperRegistryInitializer: "explicit" | "fuse-derived";
  /**
   * How WrapperRegistry `isEmancipated` is computed: `static` (always `true`) or `role-derived`
   * (from the unemancipated role bitmap).
   */
  readonly wrapperRegistryEmancipation: "static" | "role-derived";
  /**
   * How locked migration treats names with `CAN_EXTEND_EXPIRY`: grant the `renew-role`, or set
   * the expiry to `max-expiry` (`type(uint64).max`).
   */
  readonly lockedMigrationRenewal: "renew-role" | "max-expiry";
  /** User registries only upgrade to implementations approved by `UPGRADE_SET()`. */
  readonly userRegistryUpgradeGate: boolean;
  /** The HCA validator rejects permits whose source chain is the current chain. */
  readonly hcaSameChainSourceRejected: boolean;
}

/**
 * An ENSv2 deployment.
 *
 * @since 1.0.0
 */
export interface V2 {
  /** Stable identifier, e.g. `mainnet-v2`. */
  readonly id: string;
  readonly chainId: number;
  readonly protocol: "v2";
  readonly status: Status;
  readonly contracts: V2Contracts;
  readonly implementations: V2Implementations;
  readonly migration: V2Migration;
  readonly infrastructure: V2Infrastructure;
  readonly dns?: V2Dns;
  readonly hca?: V2Hca;
  readonly testTokens?: V2TestTokens;
  readonly capabilities: Capabilities;
  readonly provenance?: Provenance;
}

/**
 * Every ENS deployment on one chain.
 *
 * @since 1.0.0
 */
export interface Profile {
  /** Network name, e.g. `mainnet`. */
  readonly name: string;
  readonly chainId: number;
  readonly v1?: V1;
  readonly v2?: V2;
}
