import { absurd, type Effect, type FileSystem } from "effect";

import {
  isL2Profile,
  type ArtifactError,
  type BuildName,
  type CurrentStep,
  type DeployError,
  type L2ProfileName,
  type StepContext,
} from "@ensforge/test-devnet";
import { getAddress, type Address, type Hex } from "viem";

/** JSON-safe facts a fixture records: addresses, expiries (decimal strings), expected values. */
export type Facts = Readonly<Record<string, string | number | boolean | null>>;

/** The address fact `key`, which a fixture's phase recorded. */
export const factAddress = (facts: Facts, key: string): Address => getAddress(String(facts[key]));

/** Axis → value, e.g. `{ kind: "v1-wrapped", fuses: "locked" }`. Tests select by these. */
export type Tags = Readonly<Record<string, string>>;

/** What a phase records; bigints are stored as decimal strings. */
export type RawFacts = Readonly<Record<string, string | number | boolean | bigint | null>>;

type Phase = (
  context: StepContext,
  facts: Facts,
) => Effect.Effect<RawFacts, DeployError | ArtifactError, FileSystem.FileSystem | CurrentStep>;

/**
 * One seeded name state. Phases run in build order: `prelaunch` before the ENSv2 launch (ENSv1
 * history), `postlaunch` after it, `afterTime` after the build's single clock jump
 * (`clockJump`), and `check` last, against the final state. Each phase returns facts that are
 * merged into the fixture's manifest entry; `name` must be among them.
 */
export type Fixture = {
  readonly id: string;
  /** Catalog IDs (`cases.json`) this state serves. */
  readonly cases: readonly string[];
  readonly tags: Tags;
  /** Needs ENSv2 (not on `v1-live`). */
  readonly v2?: true;
  /** Needs the ENSv2 launch (not on `v1-live` or `v1-v2-greenfield`). */
  readonly launched?: true;
  /** Needs ENSv1 controllers to register after the clock jump (only before the launch). */
  readonly unlaunched?: true;
  /** Also seeded on `sepolia-shaped`, whose capabilities change this state. */
  readonly sepolia?: true;
  /**
   * Left out of `mainnet-shaped`'s premigration: ENSv2 holds no reservation for the name's `.eth`
   * second-level name.
   */
  readonly unreserved?: true;
  /** Needs the L2 namespaces' Ethereum resolvers (only `mainnet-shaped` and `v2-only`). */
  readonly namespaces?: true;
  /** A name on this L2, seeded on its L2 profile only. */
  readonly chain?: L2ProfileName;
  readonly prelaunch?: Phase;
  readonly postlaunch?: Phase;
  readonly afterTime?: Phase;
  readonly check: (
    context: StepContext,
    facts: Facts,
  ) => Effect.Effect<void, DeployError | ArtifactError, FileSystem.FileSystem | CurrentStep>;
};

/** A seeded fixture as tests see it. */
export type FixtureEntry = {
  readonly id: string;
  readonly name: string;
  readonly node: Hex;
  readonly tags: Tags;
  readonly cases: readonly string[];
  readonly facts: Facts;
};

/** What a profile's build seeded. */
export type Manifest = {
  readonly profile: BuildName;
  /** Timestamp of the build's clock jump, and its length in seconds. */
  readonly clock: { readonly jumpedAt: string; readonly jump: string };
  readonly fixtures: readonly FixtureEntry[];
};

/** Seconds the build clock jumps once, after every fixture is registered. */
export const clockJump = 400n * 86_400n;

/** Whether `fixture` is seeded on `profile`. */
export const seededOn = (fixture: Fixture, profile: BuildName): boolean => {
  if (fixture.chain !== undefined || isL2Profile(profile)) return fixture.chain === profile;
  if (fixture.namespaces === true && profile !== "mainnet-shaped" && profile !== "v2-only")
    return false;
  switch (profile) {
    case "v1-live":
      return fixture.v2 !== true && fixture.launched !== true;
    case "v1-v2-greenfield":
      return fixture.launched !== true;
    case "sepolia-shaped":
      return fixture.sepolia === true && fixture.unlaunched !== true;
    case "mainnet-shaped":
    case "v2-only":
      return fixture.unlaunched !== true;
    default:
      return absurd(profile);
  }
};
