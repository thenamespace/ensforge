import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { factAddress, Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import type { Address } from "viem";

import { Clients } from "../support/clients.ts";
import { chainServices } from "../support/lane.ts";
import { Namespaces } from "../support/namespaces.ts";

// Writes on L2 names go to the L2 the name lives on: records, transfers and approvals, signed by
// the client's wallet on that chain. Every other write is refused before anything is signed.

const services = Namespaces.layer.pipe(
  Layer.provideMerge(chainServices),
  Layer.provideMerge(Fixtures.layer({ profile: "mainnet-shaped" })),
);

describe("writes on L2 names", () => {
  layer(services, { excludeTestServices: true })("mainnet-shaped", (it) => {
    it.effect(
      "writes each family's records on its L2, and refuses other accounts",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const clients = yield* Clients;
          const { bob, carol } = (yield* Devnet).accounts;
          const { "l2-base": base, "l2-linea": linea, "l2-celo": celo } = namespaces.fixtures;
          const fixtures = [
            [base.byId("namespaces.basenames.active"), 8453],
            [base.byId("namespaces.basenames.subname"), 8453],
            [linea.byId("namespaces.linea.active"), 59144],
            [linea.byId("namespaces.linea.subname"), 59144],
            [celo.byId("namespaces.celonames.active"), 42220],
            [base.byId("namespaces.durin.active"), 8453],
            [base.byId("namespaces.namespace.base.active"), 8453],
            [namespaces.fixtures["l2-optimism"].byId("namespaces.namespace.optimism.active"), 10],
          ] as const;

          yield* namespaces.isolated(
            Effect.gen(function* () {
              for (const [{ name, facts }, chainId] of fixtures) {
                const owner = factAddress(facts, "owner");
                const ens = clients.make({ account: owner, ...namespaces.clientOptions(owner) });

                const { plan } = yield* Actions.record.setSync(ens, {
                  name,
                  addresses: { eth: carol },
                  texts: { description: `written on ${chainId}` },
                });
                const records = yield* Actions.record.get(ens, {
                  name,
                  addresses: ["eth"],
                  texts: ["description"],
                });
                assert.strictEqual(plan.chainId, chainId, name);
                assert.deepInclude(
                  records,
                  {
                    addresses: { eth: carol },
                    texts: { description: `written on ${chainId}` },
                  },
                  name,
                );

                const stranger = owner === bob ? carol : bob;
                yield* expectFailure(
                  Actions.record.set(
                    clients.make({ account: stranger, ...namespaces.clientOptions(stranger) }),
                    { name, texts: { description: "not theirs" } },
                  ),
                  { _tag: "UnauthorizedError" },
                );
              }
            }),
          );
        }),
      { meta: { cases: ["N20"] } },
    );

    it.effect("clears an L2 name's records, and rejects a profile Durin lacks", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const clients = yield* Clients;
        const { alice } = (yield* Devnet).accounts;
        const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });

        yield* namespaces.isolated(
          Effect.gen(function* () {
            yield* Actions.record.setSync(ens, { name: "alice.base.eth", clear: true });
            const records = yield* Actions.record.get(ens, {
              name: "alice.base.eth",
              addresses: ["eth"],
              texts: ["url"],
            });
            assert.deepInclude(records, { addresses: { eth: null }, texts: { url: null } });

            yield* expectFailure(
              Actions.record.set(ens, { name: "alice.durin-names.eth", nameRecord: alice }),
              { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
            );
          }),
        );
      }),
    );

    it.effect(
      "transfers each family's names on their L2, and their records follow",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const clients = yield* Clients;
          const { bob, carol } = (yield* Devnet).accounts;
          const { "l2-base": base, "l2-linea": linea, "l2-celo": celo } = namespaces.fixtures;
          const fixtures = [
            base.byId("namespaces.basenames.active"),
            base.byId("namespaces.basenames.subname"),
            linea.byId("namespaces.linea.active"),
            celo.byId("namespaces.celonames.active"),
            base.byId("namespaces.durin.active"),
            base.byId("namespaces.namespace.base.active"),
          ];

          yield* namespaces.isolated(
            Effect.gen(function* () {
              for (const { name, facts } of fixtures) {
                const owner = factAddress(facts, "owner");
                const to: Address = owner === bob ? carol : bob;
                const ens = clients.make({ account: owner, ...namespaces.clientOptions(owner) });

                yield* Actions.name.transferSync(ens, { name, to });
                const state = yield* Actions.name.get(ens, { name });
                assert.strictEqual(state.owner, to, name);

                // The new owner writes the records; the previous one no longer can.
                yield* Actions.record.setSync(
                  clients.make({ account: to, ...namespaces.clientOptions(to) }),
                  { name, texts: { description: "new owner" } },
                );
                yield* expectFailure(
                  Actions.record.set(ens, { name, texts: { description: "old owner" } }),
                  { _tag: "UnauthorizedError" },
                );
              }
            }),
          );
        }),
      { meta: { cases: ["N20"] } },
    );

    it.effect("approves a token and an operator on the L2", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const clients = yield* Clients;
        const { alice, bob, carol } = (yield* Devnet).accounts;
        const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });
        const asCarol = clients.make({ account: carol, ...namespaces.clientOptions(carol) });

        yield* namespaces.isolated(
          Effect.gen(function* () {
            for (const name of ["alice.base.eth", "alice.linea.eth", "alice.ns-base.eth"]) {
              yield* Actions.approval.setTokenSync(ens, { name, to: carol });
              const approved = yield* Actions.approval.getToken(ens, { name });
              assert.strictEqual(approved, carol, name);
            }
            // The approved address may move the token.
            yield* Actions.name.transferSync(asCarol, { name: "alice.base.eth", to: bob });
            assert.strictEqual(
              (yield* Actions.name.get(ens, { name: "alice.base.eth" })).owner,
              bob,
            );

            const name = "alice.celo.eth";
            yield* Actions.approval.setOperatorSync(ens, { name, operator: carol, approved: true });
            const operator = yield* Actions.approval.getOperator(ens, {
              name,
              owner: alice,
              operator: carol,
            });
            assert.isTrue(operator);
            const check = yield* Actions.permission.check(ens, {
              name,
              account: carol,
              operation: "transfer",
            });
            assert.deepInclude(check, { allowed: true, via: "operator" });
            yield* Actions.name.transferSync(asCarol, { name, to: bob });
            assert.strictEqual((yield* Actions.name.get(ens, { name })).owner, bob);

            yield* expectFailure(
              Actions.approval.setToken(
                clients.make({ account: bob, ...namespaces.clientOptions(bob) }),
                { name: "sub.subparent.base.eth", to: carol },
              ),
              { _tag: "UnsupportedError" },
            );
          }),
        );
      }),
    );

    it.effect("refuses expired and unregistered L2 names", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const clients = yield* Clients;
        const { alice } = (yield* Devnet).accounts;
        const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });
        const { "l2-base": base, "l2-celo": celo } = namespaces.fixtures;

        for (const fixture of [
          base.byId("namespaces.basenames.grace"),
          base.byId("namespaces.basenames.expired"),
          celo.byId("namespaces.celonames.expired"),
          base.byId("namespaces.namespace.base.expired"),
        ]) {
          yield* expectFailure(
            Actions.record.set(ens, { name: fixture.name, texts: { url: "x" } }),
            { _tag: "NameStateError", code: "NAME_EXPIRED" },
          );
          yield* expectFailure(Actions.name.transfer(ens, { name: fixture.name, to: alice }), {
            _tag: "NameStateError",
            code: "NAME_EXPIRED",
          });
        }
        const unclaimed = yield* expectFailure(
          Actions.record.set(ens, { name: "unclaimed.base.eth", texts: { url: "x" } }),
          { _tag: "NameStateError", code: "NAME_NOT_REGISTERED" },
        );
        assert.strictEqual(unclaimed.context.chainId, 8453);
      }),
    );

    it.effect(
      "refuses every other write on an L2 name before signing, naming its L2",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const clients = yield* Clients;
          const { alice } = (yield* Devnet).accounts;
          const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });
          const name = "alice.celo.eth";
          const external = { _tag: "NameStateError", code: "NAME_EXTERNAL" } as const;

          // Celonames' registry is its resolver, and only its registrar creates names.
          for (const write of [
            Actions.resolver.set(ens, { name, resolver: alice }),
            Actions.name.setTtl(ens, { name, ttl: 60n }),
            Actions.subname.create(ens, { name: `sub.${name}`, owner: alice }),
            Actions.record.set(ens, { name, texts: { url: "x" }, resolver: alice }),
          ]) {
            const error = yield* expectFailure(write, external);
            assert.strictEqual(error.context.chainId, 42220);
            assert.include(
              error.shortMessage,
              "ensforge can change its records, owner and approvals",
            );
          }
          // Basenames takes ENS's registry calls, not a manager of its own.
          const manager = yield* expectFailure(
            Actions.name.setManager(ens, { name: "alice.base.eth", manager: alice }),
            external,
          );
          assert.include(
            manager.shortMessage,
            "ensforge can change its records, resolver, TTL, subnames, owner and approvals",
          );
        }),
      { meta: { cases: ["N21"] } },
    );

    it.effect("sends L2 writes from the wallet only: no route, and a reachable L2", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const clients = yield* Clients;
        const { alice } = (yield* Devnet).accounts;
        const name = "alice.base.eth";

        yield* expectFailure(
          Actions.record.set(clients.make({ account: alice, ...namespaces.clientOptions(alice) }), {
            name,
            texts: { url: "x" },
            via: { id: "relay", prepare: (plan) => Promise.resolve(plan) },
          }),
          { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" },
        );
        const unreachable = yield* expectFailure(
          Actions.record.set(clients.make({ account: alice, deployment: namespaces.deployment }), {
            name,
            texts: { url: "x" },
          }),
          { _tag: "ConfigError", code: "CHAIN_NOT_CONFIGURED" },
        );
        assert.strictEqual(unreachable.context.chainId, 8453);
      }),
    );
  });
});
