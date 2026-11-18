import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { labelhash, namehash } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

// `reachable` follows ENSv2 resolution: an ENSv1 name is reachable when the resolver ENSv2 finds
// for it reads ENSv1 (the ENSv1 bridge or a DNS TLD resolver). Each case reads a record too.
describe("reachability", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "a child stays reachable under a parent migrated with the ENSv1 bridge as its resolver",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, carol } = devnet.accounts;
          const ens = clients.make({ account: alice });
          const { name } = (yield* Fixtures).byId("v2.reserved");
          const child = `kid.${name}`;

          for (const [resolver, reachable] of [
            [devnet.contract("v2.ensV1Resolver"), true],
            ["keep", false],
          ] as const) {
            yield* chain.isolated(
              Effect.gen(function* () {
                yield* Actions.subname.createSync(ens, {
                  name: child,
                  resolver: devnet.contract("v1.publicResolver"),
                  records: { addresses: { eth: carol } },
                });

                yield* Actions.migration.migrateSync(ens, {
                  names: { name, subnames: [] },
                  resolver,
                  onStep: chain.passWaits,
                });

                assert.deepInclude(yield* Actions.name.get(ens, { name: child }), {
                  kind: "v1-unwrapped",
                  reachable,
                });
                assert.strictEqual(
                  yield* Actions.record.getAddress(ens, { name: child }),
                  reachable ? carol : null,
                );
              }),
            );
          }
        }),
      { meta: { cases: ["M:A4"] } },
    );

    it.effect(
      "an emancipated child of a migrated locked parent stays reachable until it migrates",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob } = devnet.accounts;
          const parent = fixtures.byId("v1.wrapped.locked").name;
          const child = fixtures.byId("v1.wrapped.sub.emancipated").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              const holder = clients.make({ account: bob });
              yield* Actions.resolver.setSync(holder, { name: child, resolver: "default" });
              yield* Actions.record.setSync(holder, { name: child, addresses: { eth: bob } });

              yield* Actions.migration.migrateSync(clients.make({ account: alice }), {
                names: parent,
                resolver: "keep",
                onStep: chain.passWaits,
              });

              assert.deepInclude(yield* Actions.name.get(holder, { name: child }), {
                kind: "v1-wrapped",
                reachable: true,
              });
              assert.strictEqual(yield* Actions.record.getAddress(holder, { name: child }), bob);
            }),
          );
        }),
      { meta: { cases: ["M:A10"] } },
    );

    it.effect(
      "an imported DNS name is reachable while its TLD resolves through the DNS TLD resolver",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, owner } = devnet.accounts;
          const { name } = (yield* Fixtures).byId("dns.imported");
          const tldOwner = clients.make({ account: owner });

          yield* chain.isolated(
            Effect.gen(function* () {
              // `com` becomes a registered TLD its owner gives a registry of its own.
              yield* chain.write({
                address: devnet.contract("v2.temporaryDnsRegistrar"),
                abi: Abis.v2.temporaryDnsRegistrar,
                functionName: "syncTLD",
                args: ["com"],
                account: alice,
              });
              yield* Actions.registry.deploySync(tldOwner, { attachTo: "com" });

              assert.isTrue((yield* Actions.name.get(clients.reader, { name })).reachable);
              assert.strictEqual(yield* Actions.record.getAddress(clients.reader, { name }), alice);

              yield* Actions.resolver.setSync(tldOwner, {
                name: "com",
                resolver: devnet.contract("v2.publicResolver"),
              });

              assert.isFalse((yield* Actions.name.get(clients.reader, { name })).reachable);
              assert.isNull(yield* Actions.record.getAddress(clients.reader, { name }));
            }),
          );
        }),
      { meta: { cases: ["M:C4"] } },
    );

    it.effect(
      "a child of a .eth name ENSv2 holds no reservation for is unreachable",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice } = devnet.accounts;
          // Left out of the premigration.
          const { name: parent } = (yield* Fixtures).byId("v1.unwrapped");
          const child = `kid.${parent}`;
          const resolver = devnet.contract("v1.publicResolver");

          yield* chain.isolated(
            Effect.gen(function* () {
              // ensforge refuses writes to names ENSv2 no longer reaches: the child is made by hand.
              yield* chain.write({
                address: devnet.contract("v1.registry"),
                abi: Abis.v1.ensRegistry,
                functionName: "setSubnodeRecord",
                args: [namehash(parent), labelhash("kid"), alice, resolver, 0n],
                account: alice,
              });
              yield* chain.write({
                address: resolver,
                abi: Abis.v1.publicResolver,
                functionName: "setAddr",
                args: [namehash(child), alice],
                account: alice,
              });

              assert.deepInclude(yield* Actions.name.get(clients.reader, { name: child }), {
                kind: "v1-unwrapped",
                owner: alice,
                reachable: false,
              });
              assert.isNull(yield* Actions.record.getAddress(clients.reader, { name: child }));
            }),
          );
        }),
      { meta: { cases: ["M:A4"] } },
    );
  });
});
