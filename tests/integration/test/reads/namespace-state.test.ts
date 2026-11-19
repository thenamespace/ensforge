import { assert, describe, layer } from "@effect/vitest";
import { Array as Arr, Effect, Layer } from "effect";

import { Actions as Requests } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { factAddress, Fixtures, type FixtureEntry } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { labelhash } from "viem";

import { Clients } from "../support/clients.ts";
import { Gateways } from "../support/gateways.ts";
import { chainServices } from "../support/lane.ts";
import { Namespaces } from "../support/namespaces.ts";

// L2 names read where they live: owner, expiry and status from their L2's registries, records
// from their L2 resolver, and who may write them. Clients reach every L2 unless a test says not.

const services = Namespaces.layer.pipe(
  Layer.provideMerge(chainServices),
  Layer.provideMerge(Fixtures.layer({ profile: "mainnet-shaped" })),
);

/** A fixture's recorded expiry. */
const expiryOf = (fixture: FixtureEntry) => BigInt(String(fixture.facts["expiry"]));

describe("L2 names read on their L2", () => {
  layer(services, { excludeTestServices: true })("mainnet-shaped", (it) => {
    it.effect(
      "name.get reports owner, expiry and status from each family's L2",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const { alice, bob } = (yield* Devnet).accounts;
          const ens = (yield* Clients).make(namespaces.clientOptions());
          const { "l2-base": base, "l2-linea": linea, "l2-celo": celo } = namespaces.fixtures;
          const byId = (fixtures: typeof base, id: string) => fixtures.byId(`namespaces.${id}`);

          const expected = [
            [
              byId(base, "basenames.active"),
              "registered",
              alice,
              expiryOf(byId(base, "basenames.active")),
            ],
            [byId(base, "basenames.grace"), "grace", null, expiryOf(byId(base, "basenames.grace"))],
            [
              byId(base, "basenames.expired"),
              "expired",
              null,
              expiryOf(byId(base, "basenames.expired")),
            ],
            [byId(base, "basenames.subname"), "registered", bob, null],
            [
              byId(linea, "linea.active"),
              "registered",
              alice,
              expiryOf(byId(linea, "linea.active")),
            ],
            [byId(linea, "linea.grace"), "grace", alice, expiryOf(byId(linea, "linea.grace"))],
            [
              byId(celo, "celonames.active"),
              "registered",
              alice,
              expiryOf(byId(celo, "celonames.active")),
            ],
            [
              byId(celo, "celonames.expired"),
              "expired",
              null,
              expiryOf(byId(celo, "celonames.expired")),
            ],
            [byId(base, "durin.active"), "registered", alice, null],
            [
              byId(base, "namespace.base.active"),
              "registered",
              alice,
              expiryOf(byId(base, "namespace.base.active")),
            ],
            [
              byId(base, "namespace.base.expired"),
              "expired",
              null,
              expiryOf(byId(base, "namespace.base.expired")),
            ],
          ] as const;

          for (const [fixture, status, owner, expiry] of expected) {
            const state = yield* Actions.name.get(ens, { name: fixture.name });
            assert.deepInclude(
              state,
              {
                kind: "l2",
                protocol: "l2",
                status,
                owner,
                expiry,
                renewable: false,
                available: status === "expired",
              },
              fixture.name,
            );
          }

          const basename = yield* Actions.name.get(ens, { name: "alice.base.eth" });
          const unclaimed = yield* Actions.name.get(ens, { name: "unclaimed.base.eth" });
          assert.deepInclude(basename, {
            registry: namespaces.l2s["l2-base"].contract("basenames.registry"),
            resolver: namespaces.l2s["l2-base"].contract("basenames.resolver"),
            tokenId: BigInt(labelhash("alice")),
          });
          assert.deepInclude(unclaimed, { kind: "l2", status: "available", owner: null });
        }),
      { meta: { cases: ["N01", "N02", "N03", "N04", "N06", "N07", "N09", "N10", "N17"] } },
    );

    it.effect(
      "reads records from the L2 resolver, without the family's gateway",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const gateways = yield* Gateways;
          const ens = (yield* Clients).make(namespaces.clientOptions());
          const failing = yield* gateways.serve(() => ({ status: 500, body: "{}" }));
          const names = [
            ...namespaces.fixtures["l2-base"].where({ kind: "l2-name", state: "active" }),
            ...namespaces.fixtures["l2-optimism"].all,
            ...namespaces.fixtures["l2-linea"].where({ state: "active" }),
            ...namespaces.fixtures["l2-celo"].where({ state: "active" }),
          ];

          yield* namespaces.isolated(
            Effect.gen(function* () {
              for (const route of [
                "basenames",
                "linea",
                "celonames",
                "durin",
                "namespace.base",
                "namespace.optimism",
              ] as const)
                yield* namespaces.pointAt(route, failing.url);

              for (const { name, facts } of names) {
                const records = yield* Actions.record.get(ens, {
                  name,
                  addresses: ["eth"],
                  texts: ["url"],
                });
                assert.deepInclude(
                  records,
                  {
                    addresses: { eth: factAddress(facts, "owner") },
                    texts: { url: `https://ensforge.com/${name}` },
                  },
                  name,
                );
              }
            }),
          );
        }),
      { meta: { cases: ["N05", "N08", "N11", "N13", "N14"] } },
    );

    it.effect(
      "treats a profile Durin lacks as a missing record, or an error when strict",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const ens = (yield* Clients).make(namespaces.clientOptions());
          const name = "alice.durin-names.eth";

          const records = yield* Actions.record.get(ens, {
            name,
            nameRecord: true,
            texts: ["url"],
          });
          assert.deepInclude(records, {
            nameRecord: null,
            texts: { url: `https://ensforge.com/${name}` },
          });
          yield* expectFailure(Actions.record.get(ens, { name, nameRecord: true, strict: true }), {
            _tag: "UnsupportedError",
            code: "RESOLVER_PROFILE_UNSUPPORTED",
          });
        }),
      { meta: { cases: ["N12"] } },
    );

    it.effect(
      "falls back to Ethereum for an L2 the client cannot reach, or fails when strict",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const { alice } = (yield* Devnet).accounts;
          const ens = (yield* Clients).make({ deployment: namespaces.deployment });
          const name = "alice.base.eth";

          const address = yield* Actions.record.getAddress(ens, { name });
          const state = yield* Actions.name.get(ens, { name });
          assert.strictEqual(address, alice);
          assert.deepInclude(state, { kind: "l2", status: "external", owner: null, chainId: 8453 });
          yield* expectFailure(Actions.record.getAddress(ens, { name, strict: true }), {
            _tag: "ConfigError",
            code: "CHAIN_NOT_CONFIGURED",
          });
          yield* expectFailure(
            Actions.record.get(ens, { name, addresses: ["eth"], strict: true }),
            { _tag: "ConfigError", code: "CHAIN_NOT_CONFIGURED" },
          );
        }),
      { meta: { cases: ["N18"] } },
    );

    it.effect("batches reads of names on several chains as each read alone answers", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const ens = (yield* Clients).make(namespaces.clientOptions());
        const names = ["alice.base.eth", "alice.linea.eth", "alice.celo.eth", "alice.ns-op.eth"];

        const { results } = yield* Actions.batch(ens, {
          requests: Arr.map(names, (name) =>
            Requests.record.get.request({ name, addresses: ["eth"] }),
          ),
        });
        const direct = yield* Effect.forEach(
          names,
          (name) => Actions.record.get(ens, { name, addresses: ["eth"] }),
          { concurrency: 1 },
        );
        assert.deepStrictEqual<unknown>(
          Arr.map(results, (result) => (result.status === "success" ? result.result : result)),
          direct,
        );
      }),
    );

    it.effect("describes the L2 resolver and who may write its records or move the name", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const { alice, bob } = (yield* Devnet).accounts;
        const ens = (yield* Clients).make(namespaces.clientOptions());
        const base = namespaces.l2s["l2-base"];
        const name = "alice.base.eth";

        const resolver = yield* Actions.resolver.get(ens, { name });
        assert.deepInclude(resolver, {
          address: base.contract("basenames.resolver"),
          inherited: false,
        });

        for (const [fixture, owner] of [
          [namespaces.fixtures["l2-base"].byId("namespaces.basenames.active"), alice],
          [namespaces.fixtures["l2-linea"].byId("namespaces.linea.active"), alice],
          [namespaces.fixtures["l2-celo"].byId("namespaces.celonames.active"), alice],
          [namespaces.fixtures["l2-base"].byId("namespaces.durin.active"), alice],
          [namespaces.fixtures["l2-base"].byId("namespaces.namespace.base.active"), alice],
        ] as const) {
          const allowed = yield* Actions.permission.check(ens, {
            name: fixture.name,
            account: owner,
            operation: { setRecord: "text" },
          });
          const other = yield* Actions.permission.check(ens, {
            name: fixture.name,
            account: bob,
            operation: { setRecord: "text" },
          });
          assert.deepInclude(allowed, { allowed: true, via: "owner" }, fixture.name);
          assert.isFalse(other.allowed, fixture.name);
        }

        const transfer = yield* Actions.permission.check(ens, {
          name,
          account: alice,
          operation: "transfer",
        });
        const resolverChange = yield* Actions.permission.check(ens, {
          name,
          account: alice,
          operation: "setResolver",
        });
        // Celonames' registry is its resolver: there is no resolver pointer to change.
        const celoResolverChange = yield* Actions.permission.check(ens, {
          name: "alice.celo.eth",
          account: alice,
          operation: "setResolver",
        });
        assert.deepInclude(transfer, { allowed: true, via: "owner" });
        assert.deepInclude(resolverChange, { allowed: true, via: "owner" });
        assert.isFalse(celoResolverChange.allowed);
        assert.strictEqual(celoResolverChange.missing[0]?.type, "blocked");
      }),
    );
  });
});
