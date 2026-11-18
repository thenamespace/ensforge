import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";

import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { Clients } from "@ensforge/test-integration/support/clients";
import { labelhash } from "viem";

import { Services } from "../stack/stack.ts";

// Writes through ensforge, then reads through bigname once it has indexed them. Indexers cannot
// follow `evm_revert`, so nothing here is isolated: every test writes its own names.

layer(Services.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })(
  "bigname after ensforge writes",
  (it) => {
    it.effect(
      "indexes a registration with records and a primary name",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { carol } = accounts;
          const ens = clients.make({ account: carol, indexer: services.indexer });
          const name = "indexed-new.eth";

          const result = yield* Actions.registration.registerSync(ens, {
            names: name,
            duration: Duration.years(1),
            records: { texts: { url: "https://carol.example" }, addresses: { eth: carol } },
            primaryName: true,
            onStep: chain.passWaits,
          });
          yield* services.waitForIndexed();

          const indexed = yield* Actions.indexer.getName(ens, { name });
          assert.include(indexed, { status: "active", owner: carol, authority: "ensV2" });
          assert.strictEqual(indexed?.expiresAt, result.names[0]?.expiry);
          const records = yield* Actions.indexer.getRecords(ens, { name });
          assert.strictEqual(records?.texts["url"], "https://carol.example");
          const primary = yield* Actions.indexer.getPrimaryName(ens, { address: carol });
          assert.strictEqual(primary.name, name);
          const owned = yield* Actions.indexer.getNamesForAddress(ens, {
            address: carol,
            relation: "owner",
          });
          assert.include(
            owned.items.map((entry) => entry.name),
            name,
          );
        }),
      { meta: { cases: ["I01"] } },
    );

    it.effect(
      "follows subnames as they are created and removed, page by page",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.carol, indexer: services.indexer });
          const parent = "indexed-parent.eth";

          yield* Actions.registration.registerSync(ens, {
            names: parent,
            duration: Duration.years(1),
            onStep: chain.passWaits,
          });
          for (const label of ["a", "b", "c"]) {
            yield* Actions.subname.createSync(ens, { name: `${label}.${parent}` });
          }
          yield* Actions.subname.removeSync(ens, { name: `b.${parent}` });
          yield* services.waitForIndexed();

          // One row a page: the cursors walk every child once.
          const listed: string[] = [];
          let cursor: string | undefined;
          do {
            const page = yield* Actions.indexer.getSubnames(ens, {
              name: parent,
              limit: 1,
              ...(cursor === undefined ? {} : { cursor }),
            });
            listed.push(...page.items.map((item) => item.name));
            cursor = page.hasMore ? (page.cursor ?? undefined) : undefined;
          } while (cursor !== undefined);

          // An unregistered child leaves the list at once; its name reads as released.
          assert.deepStrictEqual(listed.toSorted(), [`a.${parent}`, `c.${parent}`]);
          const removed = yield* Actions.indexer.getName(ens, { name: `b.${parent}` });
          assert.strictEqual(removed?.status, "released");
        }),
      { meta: { cases: ["I02", "I16"] } },
    );

    it.effect(
      "follows role grants and transfers",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { bob, carol } = accounts;
          const ens = clients.make({ account: carol, indexer: services.indexer });
          const name = "indexed-roles.eth";

          yield* Actions.registration.registerSync(ens, {
            names: name,
            duration: Duration.years(1),
            onStep: chain.passWaits,
          });
          yield* services.waitForIndexed();
          const before = yield* Actions.indexer.getName(ens, { name });
          yield* Actions.role.grantSync(ens, {
            grantee: bob,
            roles: ["setResolver"],
            target: "registry",
            name,
          });
          yield* services.waitForIndexed();

          // Granting roles regenerates the ENSv2 token; the registration stays the same.
          const after = yield* Actions.indexer.getName(ens, { name });
          assert.strictEqual(after?.registrationId, before?.registrationId);
          assert.notStrictEqual(after?.tokenId, before?.tokenId);
          const permissions = yield* Actions.indexer.getPermissions(ens, { name });
          assert.include(
            permissions.items.filter((row) => row.address === bob).flatMap((row) => row.powers),
            "set_resolver",
          );

          yield* Actions.name.transferSync(ens, { name, to: bob, unsafe: true });
          yield* services.waitForIndexed();
          assert.strictEqual((yield* Actions.indexer.getName(ens, { name }))?.owner, bob);
          const history = yield* Actions.indexer.getHistory(ens, { name });
          assert.isAbove(history.items.length, 1);
        }),
      { meta: { cases: ["I08"] } },
    );

    it.effect(
      "drops a name's records when its resolver changes",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.carol, indexer: services.indexer });
          const name = "indexed-resolver.eth";

          yield* Actions.registration.registerSync(ens, {
            names: name,
            duration: Duration.years(1),
            onStep: chain.passWaits,
          });
          yield* Actions.record.setSync(ens, { name, texts: { url: "https://old.example" } });
          yield* services.waitForIndexed();
          assert.strictEqual(
            (yield* Actions.indexer.getRecords(ens, { name }))?.texts["url"],
            "https://old.example",
          );

          const { resolver } = yield* Actions.resolver.createSync(ens, {});
          yield* Actions.resolver.setSync(ens, { name, resolver });
          yield* services.waitForIndexed();

          const records = yield* Actions.indexer.getRecords(ens, { name });
          assert.deepInclude(records?.resolver, { address: resolver });
          assert.isUndefined(records?.texts["url"]);
        }),
      { meta: { cases: ["I12"] } },
    );

    it.effect(
      "finds the records a migration copies, and the subnames it cannot recreate",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const fixtures = yield* Fixtures;
          const { alice } = accounts;
          const ens = clients.make({ account: alice, indexer: services.indexer });
          const name = fixtures.byId("records.v1").name;

          yield* Actions.subname.createSync(ens, { name: `kid.${name}` });
          yield* services.waitForIndexed();

          // Without an indexer nothing is discovered; bigname lists every key and the child.
          const options = { name, account: alice, resolver: "new" } as const;
          assert.isNull((yield* Actions.migration.get(clients.reader, options)).discovered);
          const { discovered } = yield* Actions.migration.get(ens, options);
          assert.includeMembers(
            [...(discovered?.records?.keys ?? [])],
            ["text:url", "text:unicode", "addr:0", "contenthash"],
          );
          // The ENSv1 registry stores only the child's labelhash: bigname knows it by hash.
          assert.deepStrictEqual(discovered?.subnames, [`[${labelhash("kid").slice(2)}].${name}`]);

          // No `allowIncompleteRecords`: the inventory is complete enough to copy from.
          const profile = {
            name,
            texts: ["url", "unicode"],
            addresses: ["btc"],
            contentHash: true,
          } as const;
          const before = yield* Actions.record.get(ens, profile);
          const migrated = yield* Actions.migration.migrateSync(ens, {
            names: name,
            resolver: "new",
            onStep: chain.passWaits,
          });

          assert.include(
            migrated.plan.warnings.map((warning) => warning.code),
            "SUBNAMES_NOT_RECREATED",
          );
          const after = yield* Actions.record.get(ens, profile);
          assert.notStrictEqual(after.resolver, before.resolver);
          assert.deepStrictEqual({ ...after, resolver: null }, { ...before, resolver: null });
        }),
      { meta: { cases: ["M12", "M15"] } },
    );

    it.effect(
      "finds subnames at every depth for a migration to recreate",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const fixtures = yield* Fixtures;
          const { alice, bob } = accounts;
          const ens = clients.make({ account: alice, indexer: services.indexer });
          const name = fixtures.byId("v1.wrapped").name;
          const [kid, deep] = [`kid.${name}`, `deep.kid.${name}`];

          // Wrapped children: the NameWrapper tells bigname their labels.
          yield* Actions.subname.createSync(ens, { name: kid, owner: bob, resolver: null });
          yield* Actions.subname.createSync(clients.make({ account: bob }), {
            name: deep,
            resolver: null,
          });
          yield* services.waitForIndexed();

          const { discovered } = yield* Actions.migration.get(ens, { name, account: alice });
          assert.includeMembers([...(discovered?.subnames ?? [])], [kid, deep]);

          const migrated = yield* Actions.migration.migrateSync(ens, {
            names: name,
            resolver: "keep",
            onStep: chain.passWaits,
          });
          assert.notInclude(
            migrated.plan.warnings.map((warning) => warning.code),
            "SUBNAMES_NOT_RECREATED",
          );
          for (const subname of [kid, deep]) {
            assert.deepInclude(yield* Actions.name.get(ens, { name: subname }), {
              kind: "v2-native",
              owner: bob,
            });
          }
        }),
      { meta: { cases: ["M22", "M15"] } },
    );
  },
);
