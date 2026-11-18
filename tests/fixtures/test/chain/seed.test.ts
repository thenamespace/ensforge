import { assert, describe, layer } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { profileNames } from "@ensforge/test-devnet";

import { allFixtures, Fixtures, seededOn } from "../../src/index.ts";

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
});
