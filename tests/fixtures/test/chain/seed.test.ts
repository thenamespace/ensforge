import { NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { Array as Arr, Effect, Layer } from "effect";

import { Anvil, build, l2ProfileNames, profileNames } from "@ensforge/test-devnet";

import {
  allFixtures,
  Fixtures,
  fixtureSeed,
  seededOn,
  sourcesKey,
  type Manifest,
} from "../../src/index.ts";

describe("seeded fixtures", () => {
  for (const profile of profileNames) {
    layer(Fixtures.layer({ profile }), { excludeTestServices: true })(profile, (it) => {
      it.effect("seeds and self-checks every fixture for the profile", () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const expected = Arr.filter(allFixtures, (fixture) => seededOn(fixture, profile));
          assert.deepStrictEqual(
            Arr.map(fixtures.all, (fixture) => fixture.id),
            Arr.map(expected, (fixture) => fixture.id),
          );
          for (const fixture of fixtures.all) assert.isNotEmpty(fixture.name, fixture.id);
        }),
      );
    });
  }

  layer(Anvil.layer.pipe(Layer.provideMerge(NodeServices.layer)), { excludeTestServices: true })(
    "L2 profiles",
    (it) => {
      for (const profile of l2ProfileNames) {
        it.effect(`seeds and self-checks every fixture on ${profile}`, () =>
          Effect.gen(function* () {
            const key = yield* sourcesKey();
            const built = yield* build(profile, { seed: fixtureSeed(profile, key) });
            // The seed is `fixtureSeed`'s output, a `Manifest`.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            const manifest = built.seed as Manifest;
            const expected = Arr.filter(allFixtures, (fixture) => seededOn(fixture, profile));
            assert.isNotEmpty(expected);
            assert.deepStrictEqual(
              Arr.map(manifest.fixtures, (fixture) => fixture.id),
              Arr.map(expected, (fixture) => fixture.id),
            );
          }),
        );
      }
    },
  );
});
