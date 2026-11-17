import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { bigname } from "@ensforge/sdk/indexer";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { ensforge, passWaits } from "@ensforge/test-integration/support/chain";
import { labelhash, type Address } from "viem";

import { Services, type ServicesApi } from "../stack/stack.ts";

// Writes through ensforge, then reads through bigname once it has indexed them. Indexers cannot
// follow `evm_revert`, so nothing here is isolated: every test writes its own names.

const year = 31_536_000n;

const client = (devnet: DevnetInstance, services: ServicesApi, account?: Address) =>
  ensforge(devnet, {
    indexer: bigname({ url: services.indexerUrl }),
    ...(account === undefined ? {} : { account }),
  });

const register = (devnet: DevnetInstance, services: ServicesApi, name: string, owner: Address) =>
  Actions.registration.registerSync(client(devnet, services, owner), {
    names: name,
    duration: year,
    onStep: passWaits(devnet),
  });

layer(Services.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })(
  "bigname after ensforge writes",
  (it) => {
    it.effect(
      "indexes a registration with records and a primary name",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const devnet = yield* Devnet;
          const { carol } = devnet.accounts;
          const name = "indexed-new.eth";
          const ens = client(devnet, services, carol);

          const result = yield* Actions.registration.registerSync(ens, {
            names: name,
            duration: year,
            records: { texts: { url: "https://carol.example" }, addresses: { eth: carol } },
            primaryName: true,
            onStep: passWaits(devnet),
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
          const devnet = yield* Devnet;
          const { carol } = devnet.accounts;
          const parent = "indexed-parent.eth";
          const ens = client(devnet, services, carol);
          const children = ["a", "b", "c"].map((label) => `${label}.${parent}`);

          yield* register(devnet, services, parent, carol);
          for (const child of children) {
            yield* Actions.subname.createSync(ens, { name: child });
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
              ...(cursor ? { cursor } : {}),
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
          const devnet = yield* Devnet;
          const { bob, carol } = devnet.accounts;
          const name = "indexed-roles.eth";
          const ens = client(devnet, services, carol);

          yield* register(devnet, services, name, carol);
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
          const devnet = yield* Devnet;
          const { carol } = devnet.accounts;
          const name = "indexed-resolver.eth";
          const ens = client(devnet, services, carol);

          yield* register(devnet, services, name, carol);
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
          const devnet = yield* Devnet;
          const fixtures = yield* Fixtures;
          const { alice } = devnet.accounts;
          const name = fixtures.byId("records.v1").name;
          const child = `kid.${name}`;
          const ens = client(devnet, services, alice);

          yield* Actions.subname.createSync(ens, { name: child });
          yield* services.waitForIndexed();

          // Without an indexer nothing is discovered; bigname lists every key and the child.
          const unindexed = yield* Actions.migration.get(ensforge(devnet), {
            name,
            account: alice,
            resolver: "new",
          });
          assert.isNull(unindexed.discovered);
          const status = yield* Actions.migration.get(ens, {
            name,
            account: alice,
            resolver: "new",
          });
          assert.includeMembers(
            [...(status.discovered?.records?.keys ?? [])],
            ["text:url", "text:unicode", "addr:0", "contenthash"],
          );
          // The ENSv1 registry stores only the child's labelhash: bigname knows it by hash.
          const hashed = `[${labelhash("kid").slice(2)}].${name}`;
          assert.deepStrictEqual(status.discovered?.subnames, [hashed]);

          // No `allowIncompleteRecords`: the inventory is complete enough to copy from.
          const profile = {
            texts: ["url", "unicode"],
            addresses: ["btc"],
            contentHash: true,
          } as const;
          const before = yield* Actions.record.get(ens, { name, ...profile });
          const migrated = yield* Actions.migration.migrateSync(ens, {
            names: name,
            resolver: "new",
            onStep: passWaits(devnet),
          });
          assert.include(
            migrated.plan.warnings.map((warning) => warning.code),
            "SUBNAMES_NOT_RECREATED",
          );
          const after = yield* Actions.record.get(ens, { name, ...profile });
          assert.notStrictEqual(after.resolver, before.resolver);
          assert.deepStrictEqual({ ...after, resolver: null }, { ...before, resolver: null });
        }),
      { meta: { cases: ["M12", "M15"] } },
    );
  },
);
