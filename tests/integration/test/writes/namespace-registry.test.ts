import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";

import { Clients } from "../support/clients.ts";
import { chainServices } from "../support/lane.ts";
import { Namespaces } from "../support/namespaces.ts";

// Basenames and Linea Names fork ENSv1: their names take ENS's registry and NameWrapper calls on
// their L2 (resolver, TTL, subnames, delegates). Linea names stay on Linea's PublicResolver, the
// only one its Ethereum resolver reads.

const services = Namespaces.layer.pipe(
  Layer.provideMerge(chainServices),
  Layer.provideMerge(Fixtures.layer({ profile: "mainnet-shaped" })),
);

describe("registry writes on Basenames and Linea names", () => {
  layer(services, { excludeTestServices: true })("mainnet-shaped", (it) => {
    it.effect(
      "sets the resolver and TTL on the L2, keeping Linea names on Linea's PublicResolver",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const clients = yield* Clients;
          const { alice, carol } = (yield* Devnet).accounts;
          const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });
          const base = namespaces.l2s["l2-base"];
          const linea = namespaces.l2s["l2-linea"];
          const legacy = namespaces.fixtures["l2-base"].byId("namespaces.basenames.legacy").name;

          yield* namespaces.isolated(
            Effect.gen(function* () {
              // A Basename on the legacy resolver moves to the current one, records first.
              yield* Actions.record.setSync(ens, {
                name: legacy,
                resolver: "default",
                texts: { url: "https://moved.example" },
              });
              const moved = yield* Actions.name.get(ens, { name: legacy });
              const url = yield* Actions.record.getText(ens, { name: legacy, key: "url" });
              assert.strictEqual(moved.resolver, base.contract("basenames.resolver"));
              assert.strictEqual(url, "https://moved.example");

              const { plan } = yield* Actions.resolver.setSync(ens, {
                name: "alice.base.eth",
                resolver: carol,
              });
              assert.strictEqual(plan.chainId, 8453);
              assert.strictEqual(
                (yield* Actions.name.get(ens, { name: "alice.base.eth" })).resolver,
                carol,
              );

              for (const resolver of [carol, null]) {
                yield* expectFailure(
                  Actions.resolver.set(ens, { name: "alice.linea.eth", resolver }),
                  { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" },
                );
              }
              yield* Actions.resolver.setSync(ens, {
                name: "alice.linea.eth",
                resolver: "default",
              });
              assert.strictEqual(
                (yield* Actions.name.get(ens, { name: "alice.linea.eth" })).resolver,
                linea.contract("linea.resolver"),
              );

              for (const name of ["alice.base.eth", "alice.linea.eth"]) {
                yield* Actions.name.setTtlSync(ens, { name, ttl: 300n });
                assert.strictEqual((yield* Actions.name.get(ens, { name })).ttl, 300n, name);
              }
            }),
          );
        }),
      { meta: { cases: ["N23"] } },
    );

    it.effect(
      "creates, updates and removes subnames of Basenames and Linea names",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const clients = yield* Clients;
          const { alice, bob, carol } = (yield* Devnet).accounts;
          const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });
          const asBob = clients.make({ account: bob, ...namespaces.clientOptions(bob) });
          // Reads through Ethereum and the family's gateway, as apps without an L2 RPC see it.
          const throughEthereum = clients.make({ deployment: namespaces.deployment });

          yield* namespaces.isolated(
            Effect.gen(function* () {
              for (const parent of ["alice.base.eth", "alice.linea.eth"]) {
                const name = `pay.${parent}`;
                const url = `https://${name}`;

                // Created for bob with records: the records are written while alice holds it.
                yield* Actions.subname.createSync(ens, {
                  name,
                  owner: bob,
                  records: { texts: { url } },
                });
                const created = yield* Actions.name.get(ens, { name });
                const gatewayUrl = yield* Actions.record.getText(throughEthereum, {
                  name,
                  key: "url",
                });
                assert.deepInclude(created, { kind: "l2", status: "registered", owner: bob }, name);
                assert.strictEqual(gatewayUrl, url, name);
                yield* Actions.record.setSync(asBob, { name, texts: { description: "bob's" } });

                yield* expectFailure(Actions.subname.create(ens, { name, owner: bob }), {
                  _tag: "NameStateError",
                  code: "NAME_NOT_AVAILABLE",
                });
                yield* expectFailure(
                  Actions.subname.create(ens, { name: `x.${parent}`, fuses: ["cannotUnwrap"] }),
                  { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" },
                );
                yield* expectFailure(
                  Actions.subname.create(asBob, { name: `stranger.${parent}`, owner: bob }),
                  { _tag: "UnauthorizedError" },
                );

                yield* Actions.subname.updateSync(ens, { name, owner: carol });
                assert.strictEqual((yield* Actions.name.get(ens, { name })).owner, carol, name);
                yield* Actions.subname.removeSync(ens, { name });
                assert.strictEqual((yield* Actions.name.get(ens, { name })).status, "available");

                // A child's own owner removes it too.
                const own = `self.${parent}`;
                yield* Actions.subname.createSync(ens, { name: own, owner: bob });
                yield* Actions.subname.removeSync(asBob, { name: own });
                assert.strictEqual(
                  (yield* Actions.name.get(ens, { name: own })).status,
                  "available",
                );
              }
            }),
          );
        }),
      { meta: { cases: ["N23"] } },
    );

    it.effect("approves a delegate on the L2 resolver", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const clients = yield* Clients;
        const { alice, carol } = (yield* Devnet).accounts;
        const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });
        const asCarol = clients.make({ account: carol, ...namespaces.clientOptions(carol) });

        yield* namespaces.isolated(
          Effect.gen(function* () {
            for (const name of ["alice.base.eth", "alice.linea.eth"]) {
              yield* Actions.approval.setDelegateSync(ens, {
                name,
                delegate: carol,
                approved: true,
              });
              const delegate = yield* Actions.approval.getDelegate(ens, { name, delegate: carol });
              const check = yield* Actions.permission.check(ens, {
                name,
                account: carol,
                operation: { setRecord: "text" },
              });
              assert.isTrue(delegate, name);
              assert.deepInclude(check, { allowed: true, via: "delegate" }, name);
              yield* Actions.record.setSync(asCarol, { name, texts: { description: "carol's" } });
            }
            yield* expectFailure(
              Actions.approval.setDelegate(ens, {
                name: "alice.celo.eth",
                delegate: carol,
                approved: true,
              }),
              { _tag: "NameStateError", code: "NAME_EXTERNAL" },
            );
          }),
        );
      }),
    );

    it.effect(
      "reports a Linea name's burned fuses and refuses what they block",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const clients = yield* Clients;
          const { alice } = (yield* Devnet).accounts;
          const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });
          const name = namespaces.fixtures["l2-linea"].byId("namespaces.linea.locked").name;

          const permissions = yield* Actions.permission.get(ens, { name, account: alice });
          assert.includeMembers([...permissions.fuses], ["cannotUnwrap", "cannotSetResolver"]);
          assert.deepInclude(permissions.can, { setResolver: false, setTtl: true });

          yield* namespaces.isolated(
            Effect.gen(function* () {
              yield* expectFailure(Actions.resolver.set(ens, { name, resolver: "default" }), {
                _tag: "UnauthorizedError",
                code: "FUSE_BURNED",
              });
              yield* Actions.name.setTtlSync(ens, { name, ttl: 60n });
            }),
          );
        }),
      { meta: { cases: ["N24"] } },
    );
  });
});
