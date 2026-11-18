import { assert } from "@effect/vitest";
import { Arbitrary, Config, Effect } from "effect";

import { seed } from "../sequences/budget.ts";

/** Checks `property` on generated inputs; a counterexample fails the test with its shrunk input. */
export const holds = <A, E, R>(
  arbitrary: Arbitrary.Arbitrary<A>,
  property: (value: A) => Effect.Effect<boolean, E, R>,
) =>
  Effect.gen(function* () {
    // Runs per on-chain property; each run is a few `eth_call`s.
    const runs = yield* Config.Int("ENSFORGE_PROPERTY_RUNS").pipe(
      Config.withDefault(50),
      Effect.orDie,
    );
    const result = yield* Arbitrary.checkEffect(arbitrary, property, {
      seed,
      runs,
      maxShrinks: 100,
    });
    assert.strictEqual(result._tag, "Passed", Arbitrary.formatCheckFailure(result));
  });
