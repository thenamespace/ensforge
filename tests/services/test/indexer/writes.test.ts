import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";

import { bigname, indexerActions } from "@ensforge/sdk/indexer";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { call, ensforge, passWaits } from "@ensforge/test-integration/support/chain";
import { labelhash, type Address } from "viem";

import { Services, type ServicesApi } from "../stack/stack.ts";

// Writes through ensforge, then reads through bigname once it has indexed them. Indexers cannot
// follow `evm_revert`, so nothing here is isolated: every test writes its own names.

const year = 31_536_000n;

const client = (devnet: DevnetInstance, services: ServicesApi, account?: Address) =>
  ensforge(devnet, {
    indexer: bigname({ url: services.indexerUrl }),
    ...(account === undefined ? {} : { account }),
  }).extend(indexerActions());

const register = (devnet: DevnetInstance, services: ServicesApi, name: string, owner: Address) =>
  call(() =>
    client(devnet, services, owner).registration.registerSync({
      names: name,
      duration: year,
      onStep: passWaits(devnet),
    }),
  );

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

          const result = yield* call(() =>
            ens.registration.registerSync({
              names: name,
              duration: year,
              records: { texts: { url: "https://carol.example" }, addresses: { eth: carol } },
              primaryName: true,
              onStep: passWaits(devnet),
            }),
          );
          yield* services.waitForIndexed();

          const indexed = yield* call(() => ens.indexer.getName({ name }));
          assert.include(indexed, { status: "active", owner: carol, authority: "ensV2" });
          assert.strictEqual(indexed?.expiresAt, result.names[0]?.expiry);
          const records = yield* call(() => ens.indexer.getRecords({ name }));
          assert.strictEqual(records?.texts["url"], "https://carol.example");
          const primary = yield* call(() => ens.indexer.getPrimaryName({ address: carol }));
          assert.strictEqual(primary.name, name);
          const owned = yield* call(() =>
            ens.indexer.getNamesForAddress({ address: carol, relation: "owner" }),
          );
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
            yield* call(() => ens.subname.createSync({ name: child }));
          }
          yield* call(() => ens.subname.removeSync({ name: `b.${parent}` }));
          yield* services.waitForIndexed();

          // One row a page: the cursors walk every child once.
          const listed: string[] = [];
          let cursor: string | undefined;
          do {
            const page = yield* call(() =>
              ens.indexer.getSubnames({ name: parent, limit: 1, ...(cursor ? { cursor } : {}) }),
            );
            listed.push(...page.items.map((item) => item.name));
            cursor = page.hasMore ? (page.cursor ?? undefined) : undefined;
          } while (cursor !== undefined);
          // An unregistered child leaves the list at once; its name reads as released.
          assert.deepStrictEqual(listed.toSorted(), [`a.${parent}`, `c.${parent}`]);
          const removed = yield* call(() => ens.indexer.getName({ name: `b.${parent}` }));
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
          const before = yield* call(() => ens.indexer.getName({ name }));
          yield* call(() =>
            ens.role.grantSync({ grantee: bob, roles: ["setResolver"], target: "registry", name }),
          );
          yield* services.waitForIndexed();

          // Granting roles regenerates the ENSv2 token; the registration stays the same.
          const after = yield* call(() => ens.indexer.getName({ name }));
          assert.strictEqual(after?.registrationId, before?.registrationId);
          assert.notStrictEqual(after?.tokenId, before?.tokenId);
          const permissions = yield* call(() => ens.indexer.getPermissions({ name }));
          assert.include(
            permissions.items.filter((row) => row.address === bob).flatMap((row) => row.powers),
            "set_resolver",
          );

          yield* call(() => ens.name.transferSync({ name, to: bob, unsafe: true }));
          yield* services.waitForIndexed();
          assert.strictEqual((yield* call(() => ens.indexer.getName({ name })))?.owner, bob);
          const history = yield* call(() => ens.indexer.getHistory({ name }));
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
          yield* call(() => ens.record.setSync({ name, texts: { url: "https://old.example" } }));
          yield* services.waitForIndexed();
          assert.strictEqual(
            (yield* call(() => ens.indexer.getRecords({ name })))?.texts["url"],
            "https://old.example",
          );

          const { resolver } = yield* call(() => ens.resolver.createSync({}));
          yield* call(() => ens.resolver.setSync({ name, resolver }));
          yield* services.waitForIndexed();
          const records = yield* call(() => ens.indexer.getRecords({ name }));
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

          yield* call(() => ens.subname.createSync({ name: child }));
          yield* services.waitForIndexed();

          // Without an indexer nothing is discovered; bigname lists every key and the child.
          const unindexed = yield* call(() =>
            ensforge(devnet).migration.get({ name, account: alice, resolver: "new" }),
          );
          assert.isNull(unindexed.discovered);
          const status = yield* call(() =>
            ens.migration.get({ name, account: alice, resolver: "new" }),
          );
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
          const before = yield* call(() => ens.record.get({ name, ...profile }));
          const migrated = yield* call(() =>
            ens.migration.migrateSync({ names: name, resolver: "new", onStep: passWaits(devnet) }),
          );
          assert.include(
            migrated.plan.warnings.map((warning) => warning.code),
            "SUBNAMES_NOT_RECREATED",
          );
          const after = yield* call(() => ens.record.get({ name, ...profile }));
          assert.notStrictEqual(after.resolver, before.resolver);
          assert.deepStrictEqual({ ...after, resolver: null }, { ...before, resolver: null });
        }),
      { meta: { cases: ["M12", "M15"] } },
    );
  },
);
