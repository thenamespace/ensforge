import { describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { verifyMigration } from "@ensforge/sdk/internal/internal/migration/verify";
import { expectFailure } from "@ensforge/test-harness";

import { clientFor, other, resolverA, signer } from "../world.js";

// `migration.migrate` verifies each migrated name against its plan after the last receipt; a chain
// that disagrees (here, a name that never left ENSv1) fails the write.
describe("migration.migrate verification", () => {
  it.effect("fails VERIFICATION_FAILED when a name's ENSv2 state differs from the plan", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name: "alice.eth", v1: { owner: signer, resolver: resolverA } });
      const planned = {
        name: "alice.eth",
        owner: other,
        resolver: resolverA,
        subregistry: null,
        subnames: [],
        records: undefined,
      };

      yield* expectFailure(verifyMigration(ens, [planned]), {
        _tag: "MigrationError",
        code: "VERIFICATION_FAILED",
      });
    }),
  );
});
