import { NodeServices } from "@effect/platform-node";
import { Array as Arr, Context, Effect, Formatter, Layer, Option, Record as Rec } from "effect";

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
    Arr.filter(manifest.fixtures, (fixture) =>
      Arr.every(Rec.toEntries(tags), ([axis, value]) => fixture.tags[axis] === value),
    );
  return {
    manifest,
    all: manifest.fixtures,
    byId: (id) => {
      const found = Arr.findFirst(manifest.fixtures, (fixture) => fixture.id === id);
      if (Option.isNone(found)) throw new Error(`no fixture ${id} on ${manifest.profile}`);
      return found.value;
    },
    forCase: (id) => Arr.filter(manifest.fixtures, (fixture) => fixture.cases.includes(id)),
    where,
    one: (tags) => {
      const found = where(tags);
      const [only] = found;
      if (found.length !== 1 || only === undefined) {
        throw new Error(
          `${found.length} fixtures match ${Formatter.formatJson(tags)} on ${manifest.profile}`,
        );
      }
      return only;
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
      ),
    ).pipe(Layer.provide(NodeServices.layer));
    const fixtures = Layer.effect(
      Fixtures,
      Effect.map(Effect.service(Devnet), (instance) =>
        // The seed is this package's own `fixtureSeed` output, which is a `Manifest`.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        api(instance.seed as Manifest),
      ),
    );
    return fixtures.pipe(Layer.provideMerge(devnet));
  };
}
