import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { hca } from "@ensforge/hca";
import { Duration, Name, Plan } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import {
  encodeAbiParameters,
  encodeFunctionData,
  hexToBigInt,
  namehash,
  parseAbi,
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
              assert.deepInclude(yield* Actions.name.get(ens, { name: abandoned }), {
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
              assert.deepInclude(yield* Actions.name.get(ens, { name: b }), {
                kind: "v2-native",
                owner: bob,
              });
              assert.strictEqual(yield* Actions.record.getAddress(ens, { name: b }), carol);

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
                plan.steps.map((step) => step.id),
                ["migrate", "wrapped-subnames"],
              );
              assert.include(
                plan.warnings.map((warning) => warning.code),
                "SUBNAMES_MIGRATE_SEPARATELY",
              );
              const registry = yield* Actions.registry.get(ens, { name: parent });
              assert.deepInclude(yield* Actions.name.get(ens, { name: controlled }), {
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
                plan.steps.map((step) => step.id),
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

            assert.include([...error.blockers], blocker, names.join());
            assert.isFalse(wallet.prompted(), names.join());
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
          const resolver = facts["resolver"] as Address;
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

              assert.deepInclude(yield* Actions.name.get(ens, { name }), { migrated: true });
              assert.strictEqual((yield* Actions.resolver.get(ens, { name }))?.address, resolver);
              assert.strictEqual(
                yield* Actions.record.getAddress(ens, { name: child }),
                facts["wildcardAddress"],
              );
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
              assert.strictEqual(
                yield* Actions.primaryName.get(ens, { address: accounts.alice }),
                name,
              );

              yield* Actions.migration.migrateSync(ens, {
                names: name,
                resolver: "keep",
                onStep: chain.passWaits,
              });

              assert.strictEqual((yield* Actions.name.get(ens, { name })).kind, "v2-migrated");
              assert.strictEqual(
                yield* Actions.primaryName.get(ens, { address: accounts.alice }),
                name,
              );
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
              if (record === undefined) return assert.fail("the plan was not saved");
              assert.deepStrictEqual(Object.keys(record.submitted), ["hca-setup"]);

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
              if (step === undefined) return assert.fail("the plan has no step");

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
