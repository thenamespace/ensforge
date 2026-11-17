import type { Effect, FileSystem } from "effect";

import type { ArtifactError, DeployError, ProfileName, StepContext } from "@ensforge/test-devnet";
import type { Hex } from "viem";

/** JSON-safe facts a fixture records: addresses, expiries (decimal strings), expected values. */
export type Facts = Readonly<Record<string, string | number | boolean | null>>;

/** Axis → value, e.g. `{ kind: "v1-wrapped", fuses: "locked" }`. Tests select by these. */
export type Tags = Readonly<Record<string, string>>;

/** What a phase records; bigints are stored as decimal strings. */
export type RawFacts = Readonly<Record<string, string | number | boolean | bigint | null>>;

type Phase = (
  context: StepContext,
  facts: Facts,
) => Effect.Effect<RawFacts, DeployError | ArtifactError, FileSystem.FileSystem>;

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
  readonly prelaunch?: Phase;
  readonly postlaunch?: Phase;
  readonly afterTime?: Phase;
  readonly check: (
    context: StepContext,
    facts: Facts,
  ) => Effect.Effect<void, DeployError | ArtifactError, FileSystem.FileSystem>;
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
  readonly profile: ProfileName;
  /** Timestamp of the build's clock jump, and its length in seconds. */
  readonly clock: { readonly jumpedAt: string; readonly jump: string };
  readonly fixtures: readonly FixtureEntry[];
};

/** Seconds the build clock jumps once, after every fixture is registered. */
export const clockJump = 400n * 86_400n;

/** Whether `fixture` is seeded on `profile`. */
export const seededOn = (fixture: Fixture, profile: ProfileName): boolean => {
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
  }
};
