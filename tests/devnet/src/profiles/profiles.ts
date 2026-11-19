import { Record as Rec } from "effect";

import { Deployments } from "@ensforge/contracts";

import { cutoverSteps } from "../deploy/cutover.ts";
import type { Ledger, Step, Variant } from "../deploy/engine.ts";
import { canonicalSteps, hcaSteps } from "../deploy/hca.ts";
import { l2MockSteps, mockSteps } from "../deploy/mocks.ts";
import { l2Steps, namespaceSteps } from "../deploy/namespaces.ts";
import { v1Steps } from "../deploy/v1.ts";
import { v2ResolutionSteps, v2Steps } from "../deploy/v2.ts";
import { v1Deployment, v2Deployment } from "./deployments.ts";

/** anvil's default chain ID; every profile runs on it. */
export const chainId = 31_337;

export type ProfileDefinition = {
  readonly description: string;
  readonly steps: readonly Step[];
  /** Builds to deploy; mainnet's by default. */
  readonly variant?: Variant;
  /** The ensforge deployment profile for what `steps` deployed. */
  readonly deployments: (ledger: Ledger) => Deployments.Profile;
};

// Mocks need only ENSv1, so they exist before any seed's prelaunch fixtures bind names to them.
const v1Only = [...canonicalSteps, ...v1Steps, ...mockSteps];
const greenfield = [...v1Only, ...v2Steps, ...hcaSteps, ...v2ResolutionSteps];
const mainnetShaped = [...greenfield, ...cutoverSteps];

// The devnet deploys the same builds, so it has the same capabilities.
const mainnetCapabilities = Deployments.mainnet.v2.capabilities;
const sepoliaCapabilities = Deployments.sepolia.v2.capabilities;

const sepolia: Variant = {
  network: "sepolia",
  artifacts: {
    "v2/UniversalHelper": "sepolia/UniversalHelper",
    "v2/ENSV2Resolver": "sepolia/ENSV2Resolver",
    "v2/PublicResolverV2": "sepolia/PublicResolverV2",
    "v2/UniversalResolverV2": "sepolia/UniversalResolverV2",
    "v2/WrapperRegistryImpl": "sepolia/WrapperRegistryImpl",
    // Sepolia was not redeployed after contracts-v2 #505: token-level `renew` still works there.
    "v2/UserRegistryImpl": "v2/UserRegistryImplV1_0_1",
    "v2/LockedMigrationControllerImplementation": "sepolia/LockedMigrationController",
    "v2/MigrationHelper": "sepolia/MigrationHelper",
    "v2/DNSTLDResolver": "sepolia/DNSTLDResolver",
    "v2/DNSAliasResolver": "sepolia/DNSAliasResolver",
    "hca/HCAOwnerAndSessionValidator": "sepolia/HCAOwnerAndSessionValidator",
  },
};

const profile = (deployments: Omit<Deployments.Profile, "name" | "chainId">) =>
  Deployments.define({ name: "devnet", chainId, ...deployments });

export const profiles = {
  "v1-live": {
    description:
      "ENSv1 before the ENSv2 launch: controllers register, the NameWrapper has an owner",
    steps: [...v1Only, ...l2MockSteps],
    deployments: (ledger) => profile({ v1: v1Deployment(ledger, chainId, "active") }),
  },
  "v1-v2-greenfield": {
    description:
      "ENSv1 and ENSv2 with roles granted at deploy time and ENSv1 still registering (upstream's devnet)",
    steps: [...greenfield, ...l2MockSteps],
    deployments: (ledger) =>
      profile({
        v1: v1Deployment(ledger, chainId, "active"),
        v2: v2Deployment(ledger, chainId, mainnetCapabilities),
      }),
  },
  "mainnet-shaped": {
    description: "ENSv1 and ENSv2 as on mainnet today: after the launch and the registry hand-over",
    steps: [...mainnetShaped, ...l2MockSteps, ...namespaceSteps],
    deployments: (ledger) =>
      profile({
        v1: v1Deployment(ledger, chainId, "legacy"),
        v2: v2Deployment(ledger, chainId, mainnetCapabilities),
      }),
  },
  "sepolia-shaped": {
    description:
      "The mainnet-shaped deployment on Sepolia's builds: no ResolutionError wrapping, explicit WrapperRegistry initializer, older HCA validator",
    steps: [...mainnetShaped, ...l2MockSteps],
    variant: sepolia,
    deployments: (ledger) =>
      profile({
        v1: v1Deployment(ledger, chainId, "legacy"),
        v2: v2Deployment(ledger, chainId, sepoliaCapabilities),
      }),
  },
  // ENSv2's migration contracts need ENSv1 on chain; the profile leaves it out so ensforge takes
  // its ENSv2-only paths.
  "v2-only": {
    description: "The mainnet-shaped chain, with an ensforge profile that knows only ENSv2",
    steps: [...mainnetShaped, ...l2MockSteps, ...namespaceSteps],
    deployments: (ledger) => profile({ v2: v2Deployment(ledger, chainId, mainnetCapabilities) }),
  },
} as const satisfies Record<string, ProfileDefinition>;

export type ProfileName = keyof typeof profiles;

export const profileNames = Rec.keys(profiles) as readonly ProfileName[];

export type L2ProfileDefinition = {
  readonly description: string;
  /** The L2's chain ID, which its anvil answers as. */
  readonly chainId: number;
  readonly steps: readonly Step[];
};

/**
 * L2 chains with the L2 namespaces' contracts, each on its own anvil next to a `mainnet-shaped`
 * devnet. Their names are fixtures (`@ensforge/test-fixtures`).
 */
export const l2Profiles = {
  "l2-base": {
    description: "Base: Basenames, Durin and Namespace",
    chainId: 8453,
    steps: l2Steps.base,
  },
  "l2-optimism": { description: "OP Mainnet: Namespace", chainId: 10, steps: l2Steps.optimism },
  "l2-linea": { description: "Linea: Linea Names", chainId: 59_144, steps: l2Steps.linea },
  "l2-celo": { description: "Celo: Celonames", chainId: 42_220, steps: l2Steps.celo },
} as const satisfies Record<string, L2ProfileDefinition>;

export type L2ProfileName = keyof typeof l2Profiles;

export const l2ProfileNames = Rec.keys(l2Profiles) as readonly L2ProfileName[];
