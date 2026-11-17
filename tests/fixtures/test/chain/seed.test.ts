import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";

import { profileNames } from "@ensforge/test-devnet";

import { allFixtures, Fixtures, seededOn } from "../../src/index.ts";

const profiles = profileNames;

describe("seeded fixtures", () => {
  for (const profile of profiles) {
    layer(Fixtures.layer({ profile }), { excludeTestServices: true })(profile, (it) => {
      it.effect("seeds and self-checks every fixture for the profile", () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const expected = allFixtures.filter((fixture) => seededOn(fixture, profile));
          assert.deepStrictEqual(
            fixtures.all.map((fixture) => fixture.id),
            expected.map((fixture) => fixture.id),
          );
          for (const fixture of fixtures.all) assert.isNotEmpty(fixture.name, fixture.id);
        }),
      );
    });
  }
});
