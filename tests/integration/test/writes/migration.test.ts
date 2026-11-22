import { assert, describe } from "@effect/vitest";
import { Effect, Record as Rec, Array as Arr, String as Str } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { hca } from "@ensforge/hca";
import { Duration, Name, Plan, Role } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { factAddress, Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import {
  encodeAbiParameters,
  encodeFunctionData,
  hexToBigInt,
  namehash,
  parseAbi,
  parseEther,
  zeroAddress,
  type Address,
} from "viem";

import { Clients } from "../support/clients.ts";
import { ethEntry, v1Owners } from "../support/contracts.ts";
import { Gateways } from "../support/gateways.ts";
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
                const status = yield* Actions.migration.get(ens, { name, account: alice });
                assert.strictEqual(status.route, route);

                yield* Actions.migration.migrateSync(ens, {
                  names: name,
                  resolver: "keep",
                  onStep: chain.passWaits,
                });

                const entry = yield* ethEntry(name);
                assert.strictEqual(entry.owner, alice, id);
                // The name keeps its reservation's expiry exactly.
                assert.strictEqual(entry.expiry, status.reservationExpiry, id);
                const migratedName = yield* Actions.name.get(ens, { name });
                assert.deepInclude(migratedName, {
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
      { meta: { cases: ["M:A20", "M:A21", "O27", "M06", "T07"] } },
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
              const lockedRegistry = yield* Actions.registry.get(clients.reader, { name: locked });
              assert.deepInclude(lockedRegistry, {
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
              const migratedChild = yield* Actions.name.get(owner, { name: child });
              assert.deepInclude(migratedChild, {
                kind: "v2-migrated",
                owner: accounts.bob,
              });
            }),
          );
        }),
      { meta: { cases: ["M:A22", "M04", "M07", "M09", "O28", "W38"] } },
    );

    it.effect(
      "registers an abandoned emancipated child afresh under its migrated parent",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob, carol } = devnet.accounts;
          const ens = clients.make({ account: alice });
          const parent = fixtures.byId("v1.wrapped.locked").name;
          const abandoned = fixtures.byId("v1.wrapped.sub.emancipated").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              // Bob unwraps his child and clears its registry owner; its fuses stay recorded.
              yield* Actions.wrapper.unwrapSync(clients.make({ account: bob }), {
                name: abandoned,
              });
              yield* chain.write({
                account: bob,
                address: devnet.contract("v1.registry"),
                abi: Abis.v1.ensRegistry,
                functionName: "setOwner",
                args: [namehash(abandoned), zeroAddress],
              });
              yield* Actions.migration.migrateSync(ens, {
                names: parent,
                resolver: "keep",
                onStep: chain.passWaits,
              });

              // A child still held in ENSv1 is taken until it migrates; the abandoned one is free.
              yield* expectFailure(
                Actions.subname.create(ens, {
                  name: fixtures.byId("v1.wrapped.sub.locked").name,
                  owner: carol,
                  resolver: null,
                }),
                { _tag: "NameStateError", code: "NAME_NOT_AVAILABLE" },
              );
              yield* Actions.subname.createSync(ens, {
                name: abandoned,
                owner: carol,
                resolver: null,
              });
              const abandonedName = yield* Actions.name.get(ens, { name: abandoned });
              assert.deepInclude(abandonedName, {
                kind: "v2-native",
                owner: carol,
              });
            }),
          );
        }),
      { meta: { cases: ["O29"] } },
    );

    it.effect(
      "recreates subnames at any depth, each registry owned by the subname's holder",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob, carol } = devnet.accounts;
          const ens = clients.make({ account: alice });
          const { name } = (yield* Fixtures).byId("v2.reserved");
          const [a, b] = [`a.${name}`, `b.a.${name}`];

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.createSync(ens, { name: a, owner: bob, resolver: null });
              yield* Actions.subname.createSync(clients.make({ account: bob }), {
                name: b,
                resolver: devnet.contract("v1.publicResolver"),
                records: { addresses: { eth: carol } },
              });

              // `a` is not listed: it is recreated as the level that holds `b`.
              yield* Actions.migration.migrateSync(ens, {
                names: { name, subnames: ["b.a"] },
                resolver: "keep",
                onStep: chain.passWaits,
              });

              const parent = yield* Actions.name.get(ens, { name: a });
              assert.deepInclude(parent, { kind: "v2-native", owner: bob });
              const migratedB = yield* Actions.name.get(ens, { name: b });
              assert.deepInclude(migratedB, {
                kind: "v2-native",
                owner: bob,
              });
              const address = yield* Actions.record.getAddress(ens, { name: b });
              assert.strictEqual(address, carol);

              // The migrating account keeps no roles on the registry it deployed for bob.
              const contract = parent.subregistry ?? undefined;
              const roles = (account: Address) =>
                Actions.role.get(ens, { account, target: "registry", contract, root: true });
              assert.include([...(yield* roles(bob)).names], "registrar");
              assert.deepStrictEqual((yield* roles(alice)).names, []);
            }),
          );
        }),
      { meta: { cases: ["M19"] } },
    );

    it.effect(
      "registers a locked name's controlled subnames in its WrapperRegistry once it migrated",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob } = devnet.accounts;
          const ens = clients.make({ account: alice });
          const parent = fixtures.byId("v1.wrapped.locked").name;
          const controlled = fixtures.byId("v1.wrapped.sub").name;
          const emancipated = fixtures.byId("v1.wrapped.sub.emancipated").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              const { plan } = yield* Actions.migration.migrateSync(ens, {
                names: { name: parent, subnames: [controlled, emancipated] },
                resolver: "keep",
                onStep: chain.passWaits,
              });

              assert.deepStrictEqual(
                Arr.map(plan.steps, (step) => step.id),
                ["migrate", "wrapped-subnames"],
              );
              assert.include(
                Arr.map(plan.warnings, (warning) => warning.code),
                "SUBNAMES_MIGRATE_SEPARATELY",
              );
              const registry = yield* Actions.registry.get(ens, { name: parent });
              const controlledName = yield* Actions.name.get(ens, { name: controlled });
              assert.deepInclude(controlledName, {
                kind: "v2-native",
                owner: bob,
                registry: registry?.address ?? null,
              });
              assert.strictEqual(
                (yield* Actions.name.get(ens, { name: emancipated })).kind,
                "v1-wrapped",
              );
            }),
          );
        }),
      { meta: { cases: ["M20"] } },
    );

    // Regression: a locked child listed before its locked parent got no target registry.
    it.effect(
      "migrates a locked child listed before its locked parent",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { alice } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const parent = fixtures.byId("v1.wrapped.locked").name;
          const child = `kept.${parent}`;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.createSync(ens, {
                name: child,
                resolver: null,
                fuses: ["parentCannotControl", "cannotUnwrap"],
              });
              yield* Actions.migration.migrateSync(ens, {
                names: [child, parent],
                resolver: "keep",
                onStep: chain.passWaits,
              });
              const migrated = yield* Actions.name.get(ens, { name: child });
              assert.deepInclude(migrated, { kind: "v2-migrated", owner: alice });
            }),
          );
        }),
      { meta: { cases: ["M20"] } },
    );

    // Regression: an emancipated child without cannotUnwrap is detached, not locked. The receiver
    // deploys it no WrapperRegistry, so its subnames were registered into an address without
    // code: the calls succeeded, nothing was stored, and the migration reported success.
    it.effect(
      "migrates a detached child with its subnames in a registry of its own",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob, carol } = devnet.accounts;
          const parent = fixtures.byId("v1.wrapped.locked").name;
          const detached = fixtures.byId("v1.wrapped.sub.emancipated").name;
          const holder = clients.make({ account: bob });
          const grandchild = `x.${detached}`;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.migration.migrateSync(clients.make({ account: alice }), {
                names: parent,
                resolver: "keep",
                onStep: chain.passWaits,
              });
              yield* Actions.subname.createSync(holder, {
                name: grandchild,
                owner: carol,
                resolver: null,
              });

              const status = yield* Actions.migration.get(holder, { name: detached, account: bob });
              assert.strictEqual(status.route, "locked-child");
              assert.deepStrictEqual(status.blockers, []);
              assert.isNull(status.after.subregistry);
              assert.sameMembers(
                [...status.after.roles],
                [...Role.toNames(Roles.registryBitmaps.registration, "registry")],
              );

              const { plan } = yield* Actions.migration.migrateSync(holder, {
                names: { name: detached, subnames: [grandchild] },
                resolver: "keep",
                onStep: chain.passWaits,
              });
              assert.notInclude(
                Arr.map(plan.steps, (step) => step.id),
                "wrapped-subnames",
              );
              const recreated = yield* Actions.name.get(holder, { name: grandchild });
              assert.deepInclude(recreated, { protocol: "v2", owner: carol });
            }),
          );
        }),
      { meta: { cases: ["M20"] } },
    );

    it.effect(
      "leaves a locked name's subnames behind once it burned cannotCreateSubdomain",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: devnet.accounts.alice });
          const parent = fixtures.byId("v1.wrapped.locked").name;
          const controlled = fixtures.byId("v1.wrapped.sub").name;
          const migrate = { names: { name: parent, subnames: [controlled] }, resolver: "keep" };

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.wrapper.setFusesSync(ens, {
                name: parent,
                fuses: ["cannotCreateSubdomain"],
              });

              const error = yield* expectFailure(Actions.migration.migrate(ens, migrate), {
                _tag: "MigrationError",
                code: "NOT_ELIGIBLE",
              });
              assert.deepStrictEqual(error.blockers, [
                `subname ${controlled}: ${parent} burned cannotCreateSubdomain`,
              ]);

              const { plan } = yield* Actions.migration.migrateSync(ens, {
                ...migrate,
                allowLeavingSubnames: true,
                onStep: chain.passWaits,
              });
              assert.deepStrictEqual(
                Arr.map(plan.steps, (step) => step.id),
                ["migrate"],
              );
              assert.strictEqual(
                (yield* Actions.name.get(ens, { name: controlled })).kind,
                "v1-wrapped",
              );
            }),
          );
        }),
      { meta: { cases: ["M21"] } },
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
              const text = yield* Actions.record.getText(ens, { name: withRecords, key: "url" });
              assert.strictEqual(text, before);
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
                Arr.map(plan.steps, (step) => step.id),
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
                Arr.map(plan.steps, (step) => step.id),
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

    // Late in grace the ENSv2 reservation has lapsed, but renewing through ETHRenewerV1 revives
    // it: such a name migrates with `renew`.
    it.effect(
      "migrates a name late in grace, after its reservation lapsed, with a renewal",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { alice } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const name = fixtures.byId("v1.unwrapped.grace").name;
          const before = yield* Actions.migration.get(ens, { name, account: alice });
          const lapsed = (before.reservationExpiry ?? 0n) + Duration.days(1);
          const graceEnds = (before.expiry ?? 0n) + Duration.days(90);
          assert.isBelow(Number(lapsed), Number(graceEnds), "the reservation lapses within grace");

          yield* chain.atTimestamp(
            lapsed,
            Effect.gen(function* () {
              const status = yield* Actions.migration.get(ens, { name, account: alice });
              assert.deepStrictEqual(status.blockers, ["expired"]);
              yield* Actions.migration.migrateSync(ens, {
                names: name,
                resolver: "keep",
                renew: { duration: Duration.years(1) },
                onStep: chain.passWaits,
              });
              const migrated = yield* Actions.name.get(ens, { name });
              assert.strictEqual(migrated.kind, "v2-migrated");
            }),
          );
        }),
      { meta: { cases: ["T08"] } },
    );

    // A name renewed on the registrar without the NameWrapper being told shows, past its old
    // wrapper expiry, with no owner or fuses: a locked name would look unlocked and unowned.
    it.effect(
      "refuses a name whose NameWrapper expiry is out of date until it is synced",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice } = devnet.accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const name = fixtures.byId("v1.wrapped.locked").name;
          const renewer = devnet.contract("v2.ethRenewerV1");

          yield* chain.isolated(
            Effect.gen(function* () {
              // A registrar controller renews the token directly, skipping the NameWrapper.
              yield* chain.impersonate(renewer);
              yield* chain.setBalance(renewer, parseEther("1"));
              yield* chain.write({
                address: devnet.contract("v1.baseRegistrar"),
                abi: Abis.v1.baseRegistrar,
                functionName: "renew",
                args: [Name.toTokenId(name), Duration.years(5)],
                account: renewer,
              });
              const fuses = yield* Actions.wrapper.getFuses(ens, { name });
              const stale = (fuses?.expiry ?? 0n) + Duration.days(1);

              yield* chain.atTimestamp(
                stale,
                Effect.gen(function* () {
                  const before = yield* Actions.migration.get(ens, { name, account: alice });
                  assert.include([...before.blockers], "wrapper-out-of-sync");

                  yield* Actions.wrapper.syncSync(ens, { names: name });
                  const after = yield* Actions.migration.get(ens, { name, account: alice });
                  assert.notInclude([...after.blockers], "wrapper-out-of-sync");
                  assert.strictEqual(after.route, "wrapped-locked");
                }),
              );
            }),
          );
        }),
      { meta: { cases: ["M:A8"] } },
    );

    // A locked cannotSetResolver name gets an empty PublicResolverV2 that only its new owner can
    // write, after the irreversible transfer: through an HCA the signer first makes the HCA the
    // node's delegate, so the copy runs in the same execution; for another owner it is refused.
    it.effect(
      "copies a locked name's records to PublicResolverV2, or refuses to leave them behind",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { alice, bob } = (yield* Devnet).accounts;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: alice });
          const name = fixtures.byId("v1.wrapped.locked.cannot-set-resolver").name;
          const names = { name, records: { texts: { url: "https://alice.example" } } };

          const status = yield* Actions.migration.get(ens, { name, account: alice });
          assert.strictEqual(status.resolver.plan, "public-v2");
          const refused = yield* expectFailure(
            Actions.migration.migrate.prepare(ens, { names, owner: bob }),
            { _tag: "MigrationError", code: "NOT_ELIGIBLE" },
          );
          assert.include([...(refused.blockers ?? [])], "records-not-replayable");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.migration.migrateSync(ens, {
                names,
                via: hca(),
                onStep: chain.passWaits,
              });
              const url = yield* Actions.record.getText(ens, { name, key: "url" });
              assert.strictEqual(url, "https://alice.example");
            }),
          );
        }),
      { meta: { cases: ["M07"] } },
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
            ["alice", ["v1-plain.eth"], "not-reserved"],
            ["user", [fixtures.byId("v2.reserved").name], "not-owner"],
            ["alice", [fixtures.byId("v1.wrapped.locked.cannot-approve").name], "frozen-approval"],
            ["alice", [fixtures.byId("v1.wrapped.locked.cannot-transfer").name], "cannot-transfer"],
            // One blocked name, last in the list, holds back the whole batch.
            ["alice", [fixtures.byId("v2.reserved").name, "v1-plain.eth"], "not-reserved"],
          ] as const;

          for (const [holder, names, blocker] of blocked) {
            const account = accounts[holder];
            const wallet = wallets.make(account);

            const error = yield* expectFailure(
              Actions.migration.migrate(clients.make({ account, wallet }), {
                names,
                resolver: "keep",
              }),
              { _tag: "MigrationError", code: "NOT_ELIGIBLE" },
            );

            assert.include([...error.blockers], blocker, Arr.join(names, ","));
            assert.isFalse(wallet.prompted(), Arr.join(names, ","));
          }
        }),
      { meta: { cases: ["O19", "W11", "M01", "M08"] } },
    );

    it.effect(
      "keeps an off-chain resolver without reading through its gateway",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const gateways = yield* Gateways;
          const { name, facts } = (yield* Fixtures).byId("resolver.wildcard");
          const resolver = factAddress(facts, "resolver");
          const child = String(facts["wildcardChild"]);
          const gateway = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));
          const abi = parseAbi(["function setOffchain(bool)", "function setRevertURL(string)"]);
          const ens = clients.make({ account: devnet.accounts.alice });

          yield* chain.isolated(
            Effect.gen(function* () {
              // The wildcard resolver answers through CCIP-Read from now on.
              const account = devnet.accounts.deployer;
              yield* chain.write({
                address: resolver,
                abi,
                functionName: "setOffchain",
                args: [true],
                account,
              });
              yield* chain.write({
                address: resolver,
                abi,
                functionName: "setRevertURL",
                args: [gateway.url],
                account,
              });

              yield* Actions.migration.migrateSync(ens, {
                names: name,
                resolver: "keep",
                onStep: chain.passWaits,
              });
              assert.strictEqual(gateway.requests(), 0);

              const migratedName = yield* Actions.name.get(ens, { name });
              assert.deepInclude(migratedName, { migrated: true });
              assert.strictEqual((yield* Actions.resolver.get(ens, { name }))?.address, resolver);
              const childAddress = yield* Actions.record.getAddress(ens, { name: child });
              assert.strictEqual(childAddress, facts["wildcardAddress"]);
              assert.isAbove(gateway.requests(), 0);
            }),
          );
        }).pipe(Effect.scoped),
      { meta: { cases: ["X17"] } },
    );

    it.effect(
      "keeps the owner's primary name on a name it migrates",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          // Its ENSv1 resolver holds an `eth` address of alice's.
          const { name } = (yield* Fixtures).byId("records.v1");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.primaryName.setSync(ens, { name });
              const primaryNameBeforeMigration = yield* Actions.primaryName.get(ens, {
                address: accounts.alice,
              });
              assert.strictEqual(primaryNameBeforeMigration, name);

              yield* Actions.migration.migrateSync(ens, {
                names: name,
                resolver: "keep",
                onStep: chain.passWaits,
              });

              assert.strictEqual((yield* Actions.name.get(ens, { name })).kind, "v2-migrated");
              const primaryNameAfterMigration = yield* Actions.primaryName.get(ens, {
                address: accounts.alice,
              });
              assert.strictEqual(primaryNameAfterMigration, name);
            }),
          );
        }),
      { meta: { cases: ["M16"] } },
    );

    it.effect(
      "fails typed when a token approval is revoked between the steps of a migration",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const wallets = yield* Wallets;
          const { alice } = devnet.accounts;
          const { name } = (yield* Fixtures).byId("v2.reserved");
          const storage = Plan.memoryStorage();

          yield* chain.isolated(
            Effect.gen(function* () {
              // Through the HCA: the owner approves it, then it moves the token. The owner signs
              // the approvals and closes the migration's prompt.
              const first = clients.make({
                account: alice,
                wallet: wallets.make(alice, { rejectAfter: 1 }),
                storage,
              });
              yield* expectFailure(
                Actions.migration.migrateSync(first, {
                  names: name,
                  resolver: "keep",
                  via: hca(),
                  onStep: chain.passWaits,
                }),
                { _tag: "UserRejectedError", code: "USER_REJECTED" },
              );
              const [record] = yield* Actions.plan.list(first, {});
              if (record === undefined) assert.fail("the plan was not saved");
              assert.deepStrictEqual(Rec.keys(record.submitted), ["hca-setup"]);

              yield* chain.write({
                address: devnet.contract("v1.baseRegistrar"),
                abi: Abis.v1.baseRegistrar,
                functionName: "approve",
                args: [zeroAddress, Name.toTokenId(name)],
                account: alice,
              });

              const second = clients.make({ account: alice, wallet: wallets.make(alice), storage });
              yield* expectFailure(
                Actions.plan.resumeSync(second, {
                  id: record.plan.id,
                  via: hca(),
                  onStep: chain.passWaits,
                }),
                { _tag: "UnauthorizedError", code: "NOT_OWNER" },
              );
              assert.strictEqual((yield* Actions.name.get(second, { name })).kind, "v1-unwrapped");
            }),
          );
        }),
      { meta: { cases: ["M14"] } },
    );

    // ensforge sends each name to the controller its status asks for, so these reverts need a plan
    // that went stale (or was edited) between preparing and sending it.
    it.effect(
      "decodes the controller errors of a migration plan that no longer fits its name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice } = devnet.accounts;
          const ens = clients.make({ account: alice });
          const unlocked = fixtures.byId("v1.wrapped").name;

          // Locked after the plan sent it to the unlocked controller.
          yield* chain.isolated(
            Effect.gen(function* () {
              const plan = yield* Actions.migration.migrate.prepare(ens, {
                names: unlocked,
                resolver: "keep",
              });
              yield* Actions.wrapper.setFusesSync(ens, { name: unlocked, fuses: ["cannotUnwrap"] });

              yield* expectFailure(Actions.plan.send(ens, { plan }), {
                _tag: "NameStateError",
                code: "NAME_LOCKED",
              });
            }),
          );

          // A name no fuse locks cannot enter through the locked controller: the plan's transfer
          // is redirected to it.
          yield* chain.isolated(
            Effect.gen(function* () {
              const plan = yield* Actions.migration.migrate.prepare(ens, {
                names: unlocked,
                resolver: "keep",
              });
              const swap = Str.replace(
                Str.toLowerCase(Str.slice(2)(devnet.contract("v2.unlockedMigrationController"))),
                Str.toLowerCase(Str.slice(2)(devnet.contract("v2.lockedMigrationController"))),
              );
              const redirected = Arr.map(plan.steps, (step) => ({
                ...step,
                calls: Arr.map(step.calls, (call): Plan.Call => ({
                  ...call,
                  data: `0x${swap(Str.slice(2)(call.data))}`,
                })),
              }));

              yield* expectFailure(
                Actions.plan.send(ens, { plan: { ...plan, steps: redirected } }),
                { _tag: "MigrationError", code: "NAME_NOT_LOCKED" },
              );
            }),
          );
        }),
      { meta: { cases: ["M09"] } },
    );

    // ensforge refuses a name without a reservation before sending (`not-reserved`). Sent anyway,
    // the controller's error comes back through the NameWrapper as `WrappedError::0x…`, which
    // ensforge unwraps.
    it.effect(
      "decodes the error a migration controller returns through the NameWrapper",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const fixtures = yield* Fixtures;
          const { alice } = devnet.accounts;
          const ens = clients.make({ account: alice });
          const name = fixtures.byId("v1.unwrapped").name;
          const label = Name.parse(name).label;

          yield* chain.isolated(
            Effect.gen(function* () {
              // ensforge no longer wraps a name ENSv2 does not reach; the NameWrapper still does.
              yield* chain.write({
                address: devnet.contract("v1.baseRegistrar"),
                abi: Abis.v1.baseRegistrar,
                functionName: "setApprovalForAll",
                args: [devnet.contract("v1.nameWrapper"), true],
                account: alice,
              });
              yield* chain.write({
                address: devnet.contract("v1.nameWrapper"),
                abi: Abis.v1.nameWrapper,
                functionName: "wrapETH2LD",
                args: [label, alice, 0, zeroAddress],
                account: alice,
              });
              const migrate = {
                to: devnet.contract("v1.nameWrapper"),
                value: 0n,
                data: encodeFunctionData({
                  abi: Abis.v1.nameWrapper,
                  functionName: "safeTransferFrom",
                  args: [
                    alice,
                    devnet.contract("v2.unlockedMigrationController"),
                    hexToBigInt(namehash(name)),
                    1n,
                    // LibMigration.Data: label, owner, subregistry, resolver.
                    encodeAbiParameters(
                      [
                        {
                          type: "tuple",
                          components: [
                            { type: "string" },
                            { type: "address" },
                            { type: "address" },
                            { type: "address" },
                          ],
                        },
                      ],
                      [[label, alice, zeroAddress, zeroAddress]],
                    ),
                  ],
                }),
              };
              // Any plan of alice's, its calls replaced by the hand-made migration.
              const plan = yield* Actions.record.set.prepare(ens, {
                name: fixtures.byId("records.v1").name,
                texts: { url: "x" },
              });
              const [step] = plan.steps;
              if (step === undefined) assert.fail("the plan has no step");

              const error = yield* expectFailure(
                Actions.plan.send(ens, {
                  plan: { ...plan, steps: [{ ...step, calls: [migrate] }] },
                }),
                { _tag: "UnauthorizedError", code: "MISSING_ROLES" },
              );
              assert.strictEqual(error.context.revert?.errorName, "EACUnauthorizedAccountRoles");
            }),
          );
        }),
      { meta: { cases: ["M05"] } },
    );
  });
});
