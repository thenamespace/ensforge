import { NodeServices } from "@effect/platform-node";
import { Context, Effect, Layer } from "effect";

import { Devnet, type DevnetOptions, type ProfileName } from "@ensforge/test-devnet";

import type { FixtureEntry, Manifest, Tags } from "./fixture.ts";
import { fixtureSeed, sourcesKey } from "./seed.ts";

/** The fixtures seeded on the running devnet, selected by ID, catalog case or tags. */
export type FixturesApi = {
  readonly manifest: Manifest;
  readonly all: readonly FixtureEntry[];
  readonly byId: (id: string) => FixtureEntry;
  /** Fixtures that serve catalog case `id` (e.g. `O08`, `M:A3`). */
  readonly forCase: (id: string) => readonly FixtureEntry[];
  readonly where: (tags: Tags) => readonly FixtureEntry[];
  /** The single fixture matching `tags`; throws when none or several match. */
  readonly one: (tags: Tags) => FixtureEntry;
};

const api = (manifest: Manifest): FixturesApi => {
  const where = (tags: Tags) =>
    manifest.fixtures.filter((fixture) =>
      Object.entries(tags).every(([axis, value]) => fixture.tags[axis] === value),
    );
  return {
    manifest,
    all: manifest.fixtures,
    byId: (id) => {
      const found = manifest.fixtures.find((fixture) => fixture.id === id);
      if (found === undefined) throw new Error(`no fixture ${id} on ${manifest.profile}`);
      return found;
    },
    forCase: (id) => manifest.fixtures.filter((fixture) => fixture.cases.includes(id)),
    where,
    one: (tags) => {
      const found = where(tags);
      if (found.length !== 1) {
        throw new Error(
          `${found.length} fixtures match ${JSON.stringify(tags)} on ${manifest.profile}`,
        );
      }
      return found[0] as FixtureEntry;
    },
  };
};

/**
 * A devnet with every fixture for `profile` seeded. Provides `Fixtures` and `Devnet`:
 * `layer(Fixtures.layer({ profile }), { excludeTestServices: true })("…", (it) => …)`.
 */
export class Fixtures extends Context.Service<Fixtures, FixturesApi>()(
  "@ensforge/test-fixtures/Fixtures",
) {
  static readonly layer = (
    options: { readonly profile: ProfileName } & Pick<DevnetOptions, "host" | "chainId">,
  ) => {
    const devnet = Layer.unwrap(
      sourcesKey().pipe(
        Effect.map((key) => Devnet.layer({ ...options, seed: fixtureSeed(options.profile, key) })),
        Effect.provide(NodeServices.layer),
      ),
    );
    const fixtures = Layer.effect(
      Fixtures,
      Effect.map(Effect.service(Devnet), (instance) => api(instance.seed as Manifest)),
    );
    return fixtures.pipe(Layer.provideMerge(devnet));
  };
}
