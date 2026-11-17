import { Deployments } from "@ensforge/contracts";

import { cutoverSteps } from "../deploy/cutover.ts";
import type { Ledger, Step } from "../deploy/engine.ts";
import { canonicalSteps, hcaSteps } from "../deploy/hca.ts";
import { mockSteps } from "../deploy/mocks.ts";
import { v1Steps } from "../deploy/v1.ts";
import { v2ResolutionSteps, v2Steps } from "../deploy/v2.ts";
import { mainnetCapabilities, v1Deployment, v2Deployment } from "./deployments.ts";

/** anvil's default chain ID; every profile runs on it. */
export const chainId = 31_337;

export type ProfileDefinition = {
  readonly description: string;
  readonly steps: readonly Step[];
  /** The ensforge deployment profile for what `steps` deployed. */
  readonly deployments: (ledger: Ledger) => Deployments.Profile;
};

const v1Only = [...canonicalSteps, ...v1Steps, ...mockSteps];
const ensV2 = [...canonicalSteps, ...v1Steps, ...v2Steps, ...hcaSteps, ...v2ResolutionSteps];
const greenfield = [...ensV2, ...mockSteps];
const mainnetShaped = [...ensV2, ...cutoverSteps, ...mockSteps];

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
