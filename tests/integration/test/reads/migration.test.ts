import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { maxUint64, type Address } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("migration.get", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "reports each name's route, blockers and state after migrating",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;
          const statusOf = (id: string) =>
            Actions.migration.get(reader, {
              name: fixtures.byId(id).name,
              account: accounts.alice,
            });
          const reservedUntil = BigInt(String(fixtures.byId("v2.reserved").facts["reservedUntil"]));

          const eligible = yield* statusOf("v2.reserved");
          assert.deepInclude(eligible, {
            status: "eligible",
            route: "unwrapped",
            reservationExpiry: reservedUntil,
          });
          assert.strictEqual(eligible.after.expiry, reservedUntil);
          // Premigration reserves the ENSv1 expiry plus ENSv1's grace less ENSv2's, plus a second.
          assert.strictEqual(
            reservedUntil,
            BigInt(String(fixtures.byId("v2.reserved").facts["expiry"])) +
              Duration.days(90) -
              Duration.days(28) +
              1n,
          );

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
      { meta: { cases: ["O18", "O19", "M:A20", "M:A22", "M:A23", "T07"] } },
    );

    it.effect(
      "lets the registrant migrate, not the manager",
      () =>
        Effect.gen(function* () {
          const managed = (yield* Fixtures).byId("v1.unwrapped.manager").name;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;

          assert.deepInclude(
            yield* Actions.migration.get(reader, { name: managed, account: accounts.alice }),
            { status: "eligible", owner: accounts.alice, manager: accounts.bob },
          );
          assert.deepInclude(
            yield* Actions.migration.get(reader, { name: managed, account: accounts.bob }),
            { status: "blocked", blockers: ["not-owner"] },
          );
        }),
      { meta: { cases: ["M17"] } },
    );

    it.effect(
      "blocks a locked child until its parent migrates, and for anyone but its owner",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;
          const statusOf = (id: string, account: Address) =>
            Actions.migration.get(reader, { name: fixtures.byId(id).name, account });

          assert.deepInclude(yield* statusOf("v1.wrapped.sub.locked", accounts.bob), {
            route: "locked-child",
            blockers: ["parent-not-migrated"],
          });
          // The MigrationHelper's `WrappedOwnerMismatch` and `ParentNotMigrated`, as blockers.
          assert.deepInclude(yield* statusOf("v1.wrapped.sub.locked", accounts.alice), {
            blockers: ["not-owner", "parent-not-migrated"],
          });
          // A child that can extend its own expiry never expires in ENSv2.
          const extendable = yield* statusOf("v1.wrapped.sub.can-extend", accounts.bob);
          assert.strictEqual(extendable.after.expiry, maxUint64);
        }),
      { meta: { cases: ["M11", "T14"] } },
    );
  });

  onProfile("v1-live")("v1-live", (it) => {
    it.effect("fails where ENSv2 is not deployed", () =>
      Effect.gen(function* () {
        const { reader } = yield* Clients;

        yield* expectFailure(Actions.migration.get(reader, { name: "v1-plain.eth" }), {
          _tag: "UnsupportedError",
          code: "UNSUPPORTED_ON_DEPLOYMENT",
        });
      }),
    );
  });
});
