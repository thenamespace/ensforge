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
  V2,
  Profile,
} from "./deployments/types.js";

/**
 * ENSv1 and ENSv2 on Ethereum mainnet.
 *
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
 * @since 1.0.0
 */
export const get = (options: { readonly chainId: number }): Profile | undefined =>
  builtIn.find((profile) => profile.chainId === options.chainId);

/**
 * Lists the built-in profiles.
 *
 * @since 1.0.0
 */
export const list = (): readonly Profile[] => builtIn;

/**
 * Thrown by {@link define} with every problem found in a profile.
 *
 * @since 1.0.0
 */
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

  const entries = group as Readonly<Record<string, unknown>>;
  for (const key of keys.required) {
    if (entries[key] === undefined) issues.push(`${path}.${key} is required`);
  }
  for (const [key, value] of Object.entries(entries)) {
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
    const value = deployment[group as keyof typeof v2GroupKeys];
    if (value === undefined && ["dns", "hca", "paymentTokens"].includes(group)) continue;
    validateGroup(`v2.${group}`, value, keys, issues);
  }

  const capabilities: unknown = deployment.capabilities;
  if (typeof capabilities !== "object" || capabilities === null) {
    issues.push("v2.capabilities is required");
    return;
  }

  const flags = capabilities as Readonly<Record<string, unknown>>;
  for (const [flag, allowed] of Object.entries(capabilityValues)) {
    if (!(allowed as readonly unknown[]).includes(flags[flag])) {
      issues.push(
        `v2.capabilities.${flag} must be one of ${allowed.map((value) => JSON.stringify(value)).join(", ")}`,
      );
    }
  }
};
