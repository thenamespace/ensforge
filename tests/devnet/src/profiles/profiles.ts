import { Deployments } from "@ensforge/contracts";

import { cutoverSteps } from "../deploy/cutover.ts";
import type { Ledger, Step, Variant } from "../deploy/engine.ts";
import { canonicalSteps, hcaSteps } from "../deploy/hca.ts";
import { mockSteps } from "../deploy/mocks.ts";
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

const v1Only = [...canonicalSteps, ...v1Steps, ...mockSteps];
const ensV2 = [...canonicalSteps, ...v1Steps, ...v2Steps, ...hcaSteps, ...v2ResolutionSteps];
const greenfield = [...ensV2, ...mockSteps];
const mainnetShaped = [...ensV2, ...cutoverSteps, ...mockSteps];

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
    steps: v1Only,
    deployments: (ledger) => profile({ v1: v1Deployment(ledger, chainId, "active") }),
  },
  "v1-v2-greenfield": {
    description:
      "ENSv1 and ENSv2 with roles granted at deploy time and ENSv1 still registering (upstream's devnet)",
    steps: greenfield,
    deployments: (ledger) =>
      profile({
        v1: v1Deployment(ledger, chainId, "active"),
        v2: v2Deployment(ledger, chainId, mainnetCapabilities),
      }),
  },
  "mainnet-shaped": {
    description: "ENSv1 and ENSv2 as on mainnet today: after the launch and the registry hand-over",
    steps: mainnetShaped,
    deployments: (ledger) =>
      profile({
        v1: v1Deployment(ledger, chainId, "legacy"),
        v2: v2Deployment(ledger, chainId, mainnetCapabilities),
      }),
  },
  "sepolia-shaped": {
    description:
      "The mainnet-shaped deployment on Sepolia's builds: no ResolutionError wrapping, explicit WrapperRegistry initializer, older HCA validator",
    steps: mainnetShaped,
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
    steps: mainnetShaped,
    deployments: (ledger) => profile({ v2: v2Deployment(ledger, chainId, mainnetCapabilities) }),
  },
} as const satisfies Record<string, ProfileDefinition>;

export type ProfileName = keyof typeof profiles;

export const profileNames = Object.keys(profiles) as readonly ProfileName[];
