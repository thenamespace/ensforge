import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";

import { Clients } from "../support/clients.ts";
import { ethEntry, v1Owners } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

describe("migration", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "migrates unwrapped and wrapped names, leaving their ENSv1 husk to the Graveyard",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice } = devnet.accounts;
          const ens = clients.make({ account: alice });

          for (const [id, route] of [
            ["v2.reserved", "unwrapped"],
            ["v1.wrapped", "wrapped-unlocked"],
          ] as const) {
            const { name } = fixtures.byId(id);
            yield* chain.isolated(
              Effect.gen(function* () {
                assert.strictEqual(
                  (yield* Actions.migration.get(ens, { name, account: alice })).route,
                  route,
                );

                yield* Actions.migration.migrateSync(ens, {
                  names: name,
                  resolver: "keep",
                  onStep: chain.passWaits,
                });

                assert.strictEqual((yield* ethEntry(name)).owner, alice, id);
                assert.deepInclude(yield* Actions.name.get(ens, { name }), {
                  kind: "v2-migrated",
                  migrated: true,
                });
                assert.strictEqual(
                  (yield* v1Owners(name)).registry,
                  devnet.contract("v2.graveyard"),
                  id,
                );
              }),
            );
          }
        }),
      { meta: { cases: ["M:A20", "M:A21", "O27", "M06"] } },
    );

    it.effect(
      "migrates a locked name into a WrapperRegistry, then its locked child",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const locked = fixtures.byId("v1.wrapped.locked").name;
          const child = String(fixtures.byId("migration.locked").facts["child"]);

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.migration.migrateSync(clients.make({ account: accounts.alice }), {
                names: locked,
                resolver: "keep",
                onStep: chain.passWaits,
              });
              assert.deepInclude(yield* Actions.registry.get(clients.reader, { name: locked }), {
                kind: "wrapper",
              });
            }),
          );

          // Already migrated parent (fixture): its locked child follows into the WrapperRegistry.
          const owner = clients.make({ account: accounts.bob });
          yield* chain.isolated(
            Effect.gen(function* () {
              assert.strictEqual(
                (yield* Actions.migration.get(owner, { name: child, account: accounts.bob })).route,
                "locked-child",
              );

              yield* Actions.migration.migrateSync(owner, { names: child, resolver: "keep" });
              assert.deepInclude(yield* Actions.name.get(owner, { name: child }), {
                kind: "v2-migrated",
                owner: accounts.bob,
              });
            }),
          );
        }),
      { meta: { cases: ["M:A22", "M07", "M09", "O28", "W38"] } },
    );

    it.effect(
      "copies records to a new resolver, keeps the manager, and renews a name in grace first",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });

          const withRecords = fixtures.byId("records.v1").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              const before = yield* Actions.record.getText(ens, { name: withRecords, key: "url" });

              yield* Actions.migration.migrateSync(ens, {
                names: withRecords,
                resolver: "new",
                allowIncompleteRecords: true,
                onStep: chain.passWaits,
              });

              const resolver = yield* Actions.resolver.get(ens, { name: withRecords });
              assert.strictEqual(resolver?.kind, "permissioned-resolver");
              assert.strictEqual(
                yield* Actions.record.getText(ens, { name: withRecords, key: "url" }),
                before,
              );
            }),
          );

          // Alice holds the token, bob manages the name.
          const managed = fixtures.byId("v1.unwrapped.manager").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              const { plan } = yield* Actions.migration.migrateSync(ens, {
                names: managed,
                resolver: "keep",
                preserveManager: true,
                onStep: chain.passWaits,
              });

              assert.deepStrictEqual(
                plan.steps.map((step) => step.id),
                ["migrate", "manager"],
              );
              const roles = yield* Actions.role.get(ens, {
                account: accounts.bob,
                target: "registry",
                name: managed,
              });
              assert.include([...roles.names], "setResolver");
            }),
          );

          const inGrace = fixtures.byId("v1.unwrapped.grace").name;
          yield* expectFailure(
            Actions.migration.migrate(ens, { names: inGrace, resolver: "keep" }),
            { _tag: "MigrationError", code: "NOT_ELIGIBLE" },
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              const { plan } = yield* Actions.migration.migrateSync(ens, {
                names: inGrace,
                resolver: "keep",
                renew: { duration: Duration.years(1) },
                onStep: chain.passWaits,
              });

              assert.deepStrictEqual(
                plan.steps.map((step) => step.id),
                ["renew", "migrate"],
              );
              assert.strictEqual(
                (yield* Actions.name.get(ens, { name: inGrace })).kind,
                "v2-migrated",
              );
            }),
          );
        }),
      { meta: { cases: ["T08", "O30"] } },
    );

    it.effect(
      "refuses blocked names before the wallet is asked",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const clients = yield* Clients;
          const wallets = yield* Wallets;
          const blocked = [
            ["alice", "v1-plain.eth", "not-reserved"],
            ["user", fixtures.byId("v2.reserved").name, "not-owner"],
            ["alice", fixtures.byId("v1.wrapped.locked.cannot-approve").name, "frozen-approval"],
            ["alice", fixtures.byId("v1.wrapped.locked.cannot-transfer").name, "cannot-transfer"],
          ] as const;

          for (const [holder, name, blocker] of blocked) {
            const account = accounts[holder];
            const wallet = wallets.make(account);

            const error = yield* expectFailure(
              Actions.migration.migrate(clients.make({ account, wallet }), {
                names: name,
                resolver: "keep",
              }),
              { _tag: "MigrationError", code: "NOT_ELIGIBLE" },
            );

            assert.include([...error.blockers], blocker, name);
            assert.isFalse(wallet.prompted(), name);
          }
        }),
      { meta: { cases: ["O19", "W11"] } },
    );
  });
});
