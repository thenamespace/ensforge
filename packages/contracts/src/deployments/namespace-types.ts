import type { Address } from "viem";

/**
 * Identifier of an L2 namespace family.
 *
 * @stability stable
 * @since 1.1.0
 */
export type NamespaceId = "basenames" | "linea" | "celonames" | "durin" | "namespace";

/**
 * The ENS network a namespace deployment belongs to: `mainnet` resolves through Ethereum mainnet,
 * `testnet` through Sepolia.
 *
 * @stability stable
 * @since 1.1.0
 */
export type NamespaceNetwork = "mainnet" | "testnet";

/**
 * Names under one parent name that live on one L2: the parent, the chains involved and the
 * contracts that answer for its names.
 *
 * @stability stable
 * @since 1.1.0
 */
export interface ParentNamespace<contracts> {
  /** The parent name, e.g. `base.eth`. */
  readonly parent: string;
  /** Chain ID of the ENS deployment that resolves the parent name (1 or 11155111). */
  readonly ensChainId: number;
  /** Chain ID of the L2 that stores the names. */
  readonly chainId: number;
  /** Resolver of the parent name on the ENS chain. */
  readonly l1Resolver: Address;
  /** Seconds after expiry during which only the last owner can renew. `0`: names have none. */
  readonly gracePeriod: number;
  /** Contracts on the L2. */
  readonly contracts: contracts;
}

/**
 * Basenames contracts on Base or Base Sepolia.
 *
 * @stability stable
 * @since 1.1.0
 */
export interface BasenamesContracts {
  /** ENS registry fork (`Abis.v1.ensRegistry`): owner and resolver of every node. */
  readonly registry: Address;
  /** ERC-721 registrar of second-level names (`Abis.basenames.baseRegistrar`). */
  readonly baseRegistrar: Address;
  /** Resolver of new registrations (`Abis.basenames.l2Resolver`). */
  readonly resolver: Address;
  /** Resolver of names registered before the upgradeable resolver. */
  readonly legacyResolver: Address;
}

/**
 * Linea Names contracts on Linea or Linea Sepolia, an ENSv1 fork (`Abis.v1`). Every second-level
 * name is wrapped.
 *
 * @stability stable
 * @since 1.1.0
 */
export interface LineaContracts {
  /** ENS registry fork. */
  readonly registry: Address;
  /** ERC-721 registrar of second-level names. */
  readonly baseRegistrar: Address;
  /** NameWrapper: owner and expiry of every name. */
  readonly nameWrapper: Address;
  /** Public resolver, the only resolver the parent's Ethereum resolver reads. */
  readonly resolver: Address;
}

/**
 * Celonames contracts on Celo.
 *
 * @stability stable
 * @since 1.1.0
 */
export interface CelonamesContracts {
  /** Registry, ERC-721 and resolver of every name (`Abis.celonames.registry`). */
  readonly registry: Address;
}

/**
 * Durin on one ENS network. Any second-level name can point at a Durin registry on an L2: the
 * Ethereum resolver's `l2Registry(node)` returns its chain and address.
 *
 * @stability experimental
 * @since 1.1.0
 */
export interface DurinDeployment {
  /** Chain ID of the ENS deployment (1 or 11155111). */
  readonly ensChainId: number;
  /** Ethereum resolver of Durin parent names (`Abis.durin.l1Resolver`). */
  readonly l1Resolver: Address;
  /** Registry factory, at the same address on every chain in `chainIds`. */
  readonly factory: Address;
  /** Implementation behind every registry the factory deploys (`Abis.durin.l2Registry`). */
  readonly registryImplementation: Address;
  /** L2s the factory is deployed on. */
  readonly chainIds: readonly number[];
}

/**
 * Namespace's contracts on one L2.
 *
 * @stability stable
 * @since 1.1.0
 */
export interface NamespaceChainContracts {
  /** Maps a parent name to its registry (`Abis.namespace.nodeRegistryResolver`). */
  readonly nodeRegistryResolver: Address;
  /** Shared resolver of every name on the chain (`Abis.namespace.namePublicResolver`). */
  readonly publicResolver: Address;
}

/**
 * Namespace L2 subnames on one ENS network. Each parent name has its own registry
 * (`Abis.namespace.ensNameRegistry`) on one L2.
 *
 * @stability stable
 * @since 1.1.0
 */
export interface NamespaceDeployment {
  /** Chain ID of the ENS deployment (1 or 11155111). */
  readonly ensChainId: number;
  /** Ethereum resolvers of Namespace parent names. `configs(node)` names their L2. */
  readonly hybridResolvers: {
    readonly current: Address;
    readonly previous: Address;
    /** Route-table resolver (`findRoute`), `Abis.namespace.hybridResolverV2`. */
    readonly v2: Address;
  };
  /** Contracts on each L2, by chain ID. */
  readonly chains: Readonly<Record<number, NamespaceChainContracts>>;
}

/**
 * A namespace family: its deployments on each ENS network and where they come from.
 *
 * @stability stable
 * @since 1.1.0
 */
export interface NamespaceFamily<id extends NamespaceId, deployment> {
  readonly id: id;
  /** `experimental` when upstream may still change the contracts. */
  readonly stability: "stable" | "experimental";
  /** Source repository of the contracts. */
  readonly repository: string;
  readonly mainnet: deployment;
  readonly testnet?: deployment;
}

/**
 * Whether an off-chain provider's gateway answered when the table was last checked.
 *
 * @stability stable
 * @since 1.1.0
 */
export type OffchainProviderStatus = "active" | "unavailable";

/**
 * A provider that stores names in its own database and serves them through a signed CCIP-Read
 * gateway. Its records can be read, not written, through ENS.
 *
 * @stability stable
 * @since 1.1.0
 */
export interface OffchainProvider {
  readonly id: string;
  /** Display name, e.g. `Coinbase`. */
  readonly name: string;
  /** Chain ID of the ENS deployment its resolvers are on. */
  readonly ensChainId: number;
  /** Parent names it serves, e.g. `cb.id`. Shared resolvers serve more. */
  readonly parents: readonly string[];
  /** Its resolvers on the ENS chain. */
  readonly resolvers: readonly Address[];
  /** CCIP-Read gateway URLs its resolvers name. */
  readonly gateways: readonly string[];
  readonly status: OffchainProviderStatus;
}
