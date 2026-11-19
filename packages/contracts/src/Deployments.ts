/**
 * ENS deployment profiles: contract addresses, per-deployment behaviour flags and provenance for
 * every supported chain.
 *
 * **Example** (Reading an address)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 *
 * Deployments.mainnet.v2.contracts.ethRegistry
 * Deployments.get({ chainId: 11155111 })?.v2?.capabilities.resolutionErrorWrapping
 * ```
 *
 * @since 1.0.0
 */
import { mainnetV1 } from "./deployments/mainnet-v1.js";
import { mainnetV2 } from "./deployments/mainnet-v2.js";
import type {
  NamespaceId,
  NamespaceNetwork,
  OffchainProvider,
} from "./deployments/namespace-types.js";
import {
  basenames,
  celonames,
  durin,
  linea,
  namespace,
  offchainProviders,
} from "./deployments/namespaces.js";
import { sepoliaV1 } from "./deployments/sepolia-v1.js";
import { sepoliaV2 } from "./deployments/sepolia-v2.js";
import type {
  Capabilities,
  Profile,
  V1,
  V1Contracts,
  V2,
  V2Contracts,
  V2Dns,
  V2Hca,
  V2Implementations,
  V2Infrastructure,
  V2Migration,
  V2PaymentTokens,
} from "./deployments/types.js";

export { l2ReverseRegistrars } from "./deployments/l2-reverse-registrars.js";
export { offchainProviders } from "./deployments/namespaces.js";
export type {
  NamespaceId,
  NamespaceNetwork,
  ParentNamespace,
  BasenamesContracts,
  LineaContracts,
  CelonamesContracts,
  // Durin is experimental upstream; the rest of the namespace table is stable.
  // oxlint-disable-next-line effecttsgo/api-stability-leak
  DurinDeployment,
  NamespaceChainContracts,
  NamespaceDeployment,
  NamespaceFamily,
  OffchainProviderStatus,
  OffchainProvider,
} from "./deployments/namespace-types.js";
export type {
  Status,
  Provenance,
  V1Contracts,
  V1,
  V2Contracts,
  V2Implementations,
  V2Migration,
  V2Infrastructure,
  V2Dns,
  V2Hca,
  V2PaymentTokens,
  Capabilities,
  // `V2.hca` is the experimental `V2Hca` (see `V2`).
  // oxlint-disable-next-line effecttsgo/api-stability-leak
  V2,
  Profile,
} from "./deployments/types.js";

/**
 * ENSv1 and ENSv2 on Ethereum mainnet.
 *
 * @stability stable
 * @since 1.0.0
 */
export const mainnet = {
  name: "mainnet",
  chainId: 1,
  v1: mainnetV1,
  v2: mainnetV2,
} as const satisfies Profile;

/**
 * ENSv1 (legacy) and ENSv2 on Sepolia.
 *
 * @stability stable
 * @since 1.0.0
 */
export const sepolia = {
  name: "sepolia",
  chainId: 11155111,
  v1: sepoliaV1,
  v2: sepoliaV2,
} as const satisfies Profile;

const builtIn: readonly Profile[] = [mainnet, sepolia];

/**
 * Returns the built-in profile for a chain, or `undefined` when ensforge ships none.
 *
 * **Example** (Looking up the connected chain)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 *
 * const profile = Deployments.get({ chainId: await client.getChainId() })
 * const registry = profile?.v1?.contracts.registry
 * ```
 *
 * @stability stable
 * @since 1.0.0
 */
export const get = (options: { readonly chainId: number }): Profile | undefined =>
  builtIn.find((profile) => profile.chainId === options.chainId);

/**
 * Lists the built-in profiles.
 *
 * **Example** (Listing supported chains)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 *
 * const chainIds = Deployments.list().map((profile) => profile.chainId)
 * ```
 *
 * @stability stable
 * @since 1.0.0
 */
export const list = (): readonly Profile[] => builtIn;

/**
 * L2 namespaces by ID: names whose owner, expiry and records live on an L2, not on the ENS chain.
 *
 * **Details**
 *
 * `basenames`, `linea` and `celonames` each serve one parent name. `durin` and `namespace` serve
 * any parent whose ENS resolver is theirs, and their resolver tells which L2 a parent uses. Durin
 * is experimental upstream.
 *
 * **Example** (Reading the Basenames registrar)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 *
 * const { chainId, contracts } = Deployments.namespaces.basenames.mainnet
 * contracts.baseRegistrar
 * ```
 *
 * @stability stable
 * @since 1.1.0
 */
export const namespaces = { basenames, linea, celonames, durin, namespace } as const;

/**
 * Returns the L2 namespace whose ENS resolver is `resolver`, or `undefined` when no listed
 * namespace uses it.
 *
 * **Details**
 *
 * `resolver` is the resolver of the parent name on the ENS chain `chainId`. Matching the resolver,
 * not the name, also finds every Durin and Namespace parent.
 *
 * **Example** (Finding the namespace of a parent name)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 *
 * Deployments.namespaceOf({
 *   chainId: 1,
 *   resolver: "0xde9049636F4a1dfE0a64d1bFe3155C0A14C54F31",
 * })
 * // { id: "basenames", network: "mainnet" }
 * ```
 *
 * @stability stable
 * @since 1.1.0
 */
export const namespaceOf = (options: {
  readonly chainId: number;
  readonly resolver: string;
}): { readonly id: NamespaceId; readonly network: NamespaceNetwork } | undefined => {
  const resolver = options.resolver.toLowerCase();

  for (const family of Object.values(namespaces)) {
    const networks = [
      ["mainnet", family.mainnet],
      ["testnet", "testnet" in family ? family.testnet : undefined],
    ] as const;

    for (const [network, deployment] of networks) {
      if (deployment?.ensChainId !== options.chainId) continue;

      const resolvers: readonly string[] =
        "hybridResolvers" in deployment
          ? Object.values(deployment.hybridResolvers)
          : [deployment.l1Resolver];
      if (resolvers.some((address) => address.toLowerCase() === resolver))
        return { id: family.id, network };
    }
  }
  return undefined;
};

/**
 * Returns the off-chain provider that owns `resolver` on the ENS chain `chainId`, or `undefined`.
 *
 * **Example** (Identifying cb.id's resolver)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 *
 * const provider = Deployments.offchainProvider({
 *   chainId: 1,
 *   resolver: "0x1934FC75aD10d7eEd51dc7A92773cAc96A06BE56",
 * })
 * provider?.status // "active"
 * ```
 *
 * @stability stable
 * @since 1.1.0
 */
export const offchainProvider = (options: {
  readonly chainId: number;
  readonly resolver: string;
}): OffchainProvider | undefined => {
  const resolver = options.resolver.toLowerCase();
  return Object.values(offchainProviders).find(
    (provider: OffchainProvider) =>
      provider.ensChainId === options.chainId &&
      provider.resolvers.some((address) => address.toLowerCase() === resolver),
  );
};

/**
 * Thrown by {@link define} with every problem found in a profile.
 *
 * @stability stable
 * @since 1.0.0
 */
// @ensforge/contracts is runtime-neutral (no Effect); `_tag` still lets Effect users catch it.
export class InvalidProfileError extends Error {
  override readonly name = "Deployments.InvalidProfileError";
  readonly _tag = "Deployments.InvalidProfileError";
  readonly issues: readonly string[];

  constructor(options: { readonly issues: readonly string[] }) {
    super(
      `Invalid ENS deployment profile:\n${options.issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
    this.issues = options.issues;
  }
}

/**
 * Validates a custom profile (a devnet, a fork or a chain ensforge does not ship) and returns it
 * unchanged.
 *
 * **Details**
 *
 * Checks that the chain IDs agree, that every required contract group and address is present and
 * well-formed, and that every capability flag has a known value. It does not read the chain.
 *
 * **Example** (Defining a devnet profile)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 *
 * const devnet = Deployments.define({
 *   name: "devnet",
 *   chainId: 31337,
 *   v2: { ...devnetAddresses, capabilities: Deployments.mainnet.v2.capabilities },
 * })
 * ```
 *
 * @throws `Deployments.InvalidProfileError` listing every problem found.
 * @stability stable
 * @since 1.0.0
 */
export const define = <const profile extends Profile>(profile: profile): profile => {
  const issues: string[] = [];

  if (typeof profile.name !== "string" || profile.name.length === 0)
    issues.push("name must be a non-empty string");
  if (!Number.isSafeInteger(profile.chainId) || profile.chainId <= 0)
    issues.push("chainId must be a positive integer");
  if (profile.v1 === undefined && profile.v2 === undefined)
    issues.push("at least one of v1 and v2 is required");
  if (profile.v1 !== undefined) validateV1(profile.v1, profile.chainId, issues);
  if (profile.v2 !== undefined) validateV2(profile.v2, profile.chainId, issues);

  if (issues.length > 0) throw new InvalidProfileError({ issues });
  return profile;
};

// Runtime key lists for validation; `satisfies` keeps them in sync with the interfaces.
const v1ContractKeys = {
  required: [
    "registry",
    "baseRegistrar",
    "ethRegistrarController",
    "bulkRenewal",
    "priceOracle",
    "nameWrapper",
    "publicResolver",
    "universalResolver",
    "reverseRegistrar",
    "defaultReverseRegistrar",
    "dnsRegistrar",
    "dnssecOracle",
    "offchainDnsResolver",
  ],
  optional: ["wrappedEthRegistrarController"],
} as const satisfies Keys<V1Contracts>;

const v2GroupKeys = {
  contracts: {
    required: [
      "universalResolver",
      "universalHelper",
      "rootRegistry",
      "ethRegistry",
      "ethRegistrar",
      "rentPriceOracle",
      "ensV2Resolver",
      "publicResolver",
      "verifiableFactory",
      "labelStore",
      "contractNamer",
      "reverseRegistrarAdapter",
      "defaultReverseRegistrarAdapter",
    ],
    optional: [],
  } satisfies Keys<V2Contracts>,
  implementations: {
    required: [
      "universalResolver",
      "permissionedResolver",
      "userRegistry",
      "wrapperRegistry",
      "contractNamer",
    ],
    optional: ["universalResolverV1"],
  } satisfies Keys<V2Implementations>,
  migration: {
    required: [
      "ensV1Resolver",
      "ethRenewerV1",
      "unlockedMigrationController",
      "lockedMigrationController",
      "migrationHelper",
      "graveyard",
      "publicResolverSet",
      "registryUpgradeSet",
    ],
    optional: [],
  } satisfies Keys<V2Migration>,
  infrastructure: {
    required: ["batchRegistrar", "rootBatchRegistrar"],
    optional: ["ensUriRenderer", "boxedEnsUriRenderer", "managedUniversalResolverProxy"],
  } satisfies Keys<V2Infrastructure>,
  dns: {
    required: ["tldResolver", "aliasResolver", "txtResolver", "gatewayProvider"],
    optional: ["temporaryRegistrar", "legacyTldResolver"],
  } satisfies Keys<V2Dns>,
  hca: {
    required: [
      "ownerAndSessionValidator",
      "upgradeSet",
      "standaloneFactory",
      "standaloneImplementation",
      "entryPoint",
      "intentExecutor",
      "gasRefundPaymaster",
    ],
    optional: [],
  } satisfies Keys<V2Hca>,
  paymentTokens: { required: ["dai", "usdc"], optional: [] } satisfies Keys<V2PaymentTokens>,
} as const;

const capabilityValues = {
  resolutionErrorWrapping: [true, false],
  wrapperRegistryInitializer: ["explicit", "fuse-derived"],
  wrapperRegistryEmancipation: ["static", "role-derived"],
  lockedMigrationRenewal: ["renew-role", "max-expiry"],
  userRegistryUpgradeGate: [true, false],
  userRegistryRootRenewal: [true, false],
  hcaSameChainSourceRejected: [true, false],
  hcaSessionDomain: ["smart-session", "hca"],
  hcaContractOwners: [true, false],
} as const satisfies { readonly [key in keyof Capabilities]: readonly Capabilities[key][] };

/** Required and optional keys of an address group; a misspelled or misplaced key fails to compile. */
type Keys<group> = {
  readonly required: readonly RequiredKeys<group>[];
  readonly optional: readonly Exclude<keyof group, RequiredKeys<group>>[];
};
type RequiredKeys<group> = {
  [key in keyof group]-?: undefined extends group[key] ? never : key;
}[keyof group];

const addressPattern = /^0x[0-9a-fA-F]{40}$/;

const validateGroup = (
  path: string,
  group: unknown,
  keys: { readonly required: readonly string[]; readonly optional: readonly string[] },
  issues: string[],
): void => {
  if (typeof group !== "object" || group === null) {
    issues.push(`${path} must be an object`);
    return;
  }

  for (const key of keys.required) {
    if (Reflect.get(group, key) === undefined) issues.push(`${path}.${key} is required`);
  }
  for (const key of Object.keys(group)) {
    const value: unknown = Reflect.get(group, key);
    if (!keys.required.includes(key) && !keys.optional.includes(key))
      issues.push(`${path}.${key} is not a known contract`);
    else if (value !== undefined && (typeof value !== "string" || !addressPattern.test(value))) {
      issues.push(`${path}.${key} must be a 0x-prefixed 20-byte address`);
    }
  }
};

const validateIdentity = (
  path: string,
  deployment: V1 | V2,
  chainId: number,
  issues: string[],
): void => {
  if (typeof deployment.id !== "string" || deployment.id.length === 0)
    issues.push(`${path}.id must be a non-empty string`);
  if (deployment.chainId !== chainId)
    issues.push(`${path}.chainId must equal the profile chainId ${chainId}`);
  if (!["active", "beta", "legacy"].includes(deployment.status))
    issues.push(`${path}.status must be active, beta or legacy`);
};

const validateV1 = (deployment: V1, chainId: number, issues: string[]): void => {
  validateIdentity("v1", deployment, chainId, issues);
  if (deployment.protocol !== "v1") issues.push('v1.protocol must be "v1"');
  validateGroup("v1.contracts", deployment.contracts, v1ContractKeys, issues);

  for (const key of ["legacyPublicResolvers", "frozenPublicResolvers"] as const) {
    const addresses: unknown = deployment[key];
    if (
      addresses !== undefined &&
      !(
        Array.isArray(addresses) &&
        addresses.every((address) => typeof address === "string" && addressPattern.test(address))
      )
    ) {
      issues.push(`v1.${key} must be an array of 0x-prefixed 20-byte addresses`);
    }
  }
};

const validateV2 = (deployment: V2, chainId: number, issues: string[]): void => {
  validateIdentity("v2", deployment, chainId, issues);
  if (deployment.protocol !== "v2") issues.push('v2.protocol must be "v2"');

  for (const [group, keys] of Object.entries(v2GroupKeys)) {
    const value: unknown = Reflect.get(deployment, group);
    if (value === undefined && ["dns", "hca", "paymentTokens"].includes(group)) continue;
    validateGroup(`v2.${group}`, value, keys, issues);
  }

  const capabilities: unknown = deployment.capabilities;
  if (typeof capabilities !== "object" || capabilities === null) {
    issues.push("v2.capabilities is required");
    return;
  }

  for (const [flag, allowed] of Object.entries(capabilityValues)) {
    if (!(allowed as readonly unknown[]).includes(Reflect.get(capabilities, flag))) {
      issues.push(
        `v2.capabilities.${flag} must be one of ${allowed.map((value) => JSON.stringify(value)).join(", ")}`,
      );
    }
  }
};
