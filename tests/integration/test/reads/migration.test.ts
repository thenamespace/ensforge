import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";

import { ensforge, onProfile } from "../support/chain.ts";

describe("migration.get", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "reports each name's route, blockers and state after migrating",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const ens = ensforge(yield* Devnet);
          const statusOf = (id: string) =>
            Actions.migration.get(ens, { name: fixtures.byId(id).name, account: accounts.alice });

          const premigrated = fixtures.byId("v2.reserved");
          const reservedUntil = BigInt(String(premigrated.facts["reservedUntil"]));
          const eligible = yield* statusOf("v2.reserved");
          assert.deepInclude(eligible, {
            status: "eligible",
            route: "unwrapped",
            reservationExpiry: reservedUntil,
          });
          assert.strictEqual(eligible.after.expiry, reservedUntil);

          // Without premigration there is no reservation to claim.
          assert.deepInclude(yield* statusOf("v1.unwrapped"), {
            status: "blocked",
            blockers: ["not-reserved"],
          });
          // Premigrated, but a burned CANNOT_TRANSFER keeps the token where it is.
          assert.deepInclude(yield* statusOf("v1.wrapped.locked.all"), {
            route: "wrapped-locked",
            blockers: ["cannot-transfer"],
          });
          assert.deepInclude(yield* statusOf("v1.wrapped"), {
            status: "eligible",
            route: "wrapped-unlocked",
          });
          assert.deepInclude(yield* statusOf("v1.wrapped.sub"), {
            blockers: ["unlocked-child", "not-owner"],
          });

          for (const id of ["migration.unwrapped", "migration.locked"]) {
            assert.strictEqual((yield* statusOf(id)).status, "migrated", id);
          }
          assert.strictEqual((yield* statusOf("v2.registered")).status, "not-required");
        }),
      { meta: { cases: ["O18", "O19", "M:A20", "M:A22", "M:A23"] } },
    );
  });

  onProfile("v1-live")("v1-live", (it) => {
    it.effect("fails where ENSv2 is not deployed", () =>
      Effect.gen(function* () {
        const ens = ensforge(yield* Devnet);
        yield* expectFailure(Actions.migration.get(ens, { name: "v1-plain.eth" }), {
          _tag: "UnsupportedError",
          code: "UNSUPPORTED_ON_DEPLOYMENT",
        });
      }),
    );
  });
});
