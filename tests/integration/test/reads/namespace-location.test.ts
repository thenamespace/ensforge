import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { factAddress, Fixtures } from "@ensforge/test-fixtures";
import { namehash, parseAbi } from "viem";

import { Clients } from "../support/clients.ts";
import { chainServices } from "../support/lane.ts";
import { Namespaces } from "../support/namespaces.ts";

// Where L2 namespace names live, located from their parents' Ethereum resolvers and checked on
// the L2s the clients reach.

const services = Namespaces.layer.pipe(
  Layer.provideMerge(chainServices),
  Layer.provideMerge(Fixtures.layer({ profile: "mainnet-shaped" })),
);

const setL2RegistryAbi = parseAbi([
  "function setL2Registry(bytes32 node, uint64 targetChainId, address targetRegistryAddress)",
]);

describe("name.getNamespace on L2 namespaces", () => {
  layer(services, { excludeTestServices: true })("mainnet-shaped", (it) => {
    it.effect("locates every family's names on their L2, with the registry there", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const ens = (yield* Clients).make(namespaces.clientOptions());
        const { "l2-base": base, "l2-optimism": optimism, "l2-linea": linea } = namespaces.l2s;
        const { "l2-base": onBase, "l2-optimism": onOptimism } = namespaces.fixtures;

        const expected = [
          [
            "alice.base.eth",
            {
              id: "basenames",
              parent: "base.eth",
              chainId: 8453,
              registry: base.contract("basenames.registry"),
            },
          ],
          [
            "sub.subparent.base.eth",
            {
              id: "basenames",
              parent: "base.eth",
              chainId: 8453,
              registry: base.contract("basenames.registry"),
            },
          ],
          [
            "alice.linea.eth",
            {
              id: "linea",
              parent: "linea.eth",
              chainId: 59144,
              registry: linea.contract("linea.registry"),
            },
          ],
          [
            "alice.celo.eth",
            {
              id: "celonames",
              parent: "celo.eth",
              chainId: 42220,
              registry: namespaces.l2s["l2-celo"].contract("celonames.registry"),
            },
          ],
          [
            "alice.durin-names.eth",
            {
              id: "durin",
              parent: "durin-names.eth",
              chainId: 8453,
              registry: factAddress(onBase.byId("namespaces.durin.active").facts, "registry"),
            },
          ],
          [
            "alice.ns-base.eth",
            {
              id: "namespace",
              parent: "ns-base.eth",
              chainId: 8453,
              registry: factAddress(
                onBase.byId("namespaces.namespace.base.active").facts,
                "registry",
              ),
            },
          ],
          [
            "alice.ns-previous.eth",
            {
              id: "namespace",
              parent: "ns-previous.eth",
              chainId: 8453,
              registry: factAddress(
                onBase.byId("namespaces.namespace.previous.active").facts,
                "registry",
              ),
            },
          ],
          [
            "alice.ns-v2.eth",
            {
              id: "namespace",
              parent: "ns-v2.eth",
              chainId: 8453,
              registry: factAddress(
                onBase.byId("namespaces.namespace.v2.active").facts,
                "registry",
              ),
            },
          ],
          [
            "alice.ns-op.eth",
            {
              id: "namespace",
              parent: "ns-op.eth",
              chainId: optimism.chainId,
              registry: factAddress(
                onOptimism.byId("namespaces.namespace.optimism.active").facts,
                "registry",
              ),
            },
          ],
        ] as const;

        for (const [name, location] of expected) {
          const located = yield* Actions.name.getNamespace(ens, { name });
          const state = yield* Actions.name.get(ens, { name });
          assert.deepStrictEqual(located, { kind: "l2", ...location }, name);
          assert.deepInclude(state, { kind: "l2", chainId: location.chainId }, name);
        }

        const offchain = yield* Actions.name.getNamespace(ens, { name: "anyone.ns-offchain.eth" });
        assert.deepStrictEqual(offchain, {
          kind: "offchain",
          provider: null,
          parent: "ns-offchain.eth",
        });
      }),
    );

    it.effect("follows a parent's current resolver, not the namespace it was in", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;

        yield* namespaces.isolated(
          Effect.gen(function* () {
            // `base.eth` leaves Basenames' resolver for a plain PublicResolver.
            yield* chain.write({
              account: devnet.accounts.alice,
              address: devnet.contract("v1.registry"),
              abi: parseAbi(["function setResolver(bytes32 node, address resolver)"]),
              functionName: "setResolver",
              args: [namehash("base.eth"), devnet.contract("v1.publicResolver")],
            });
            const ens = clients.make(namespaces.clientOptions());
            const located = yield* Actions.name.getNamespace(ens, { name: "alice.base.eth" });
            assert.isNull(located);
          }),
        );
      }),
    );

    it.effect("rejects a Durin registry for another name and keeps a chain it cannot reach", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const name = "alice.durin-names.eth";
        const pointAt = (chainId: bigint, registry: `0x${string}`) =>
          chain.write({
            account: devnet.accounts.alice,
            address: devnet.contract("namespaces.durin.l1Resolver"),
            abi: setL2RegistryAbi,
            functionName: "setL2Registry",
            args: [namehash("durin-names.eth"), chainId, registry],
          });
        const otherRegistry = factAddress(
          namespaces.fixtures["l2-base"].byId("namespaces.namespace.base.active").facts,
          "registry",
        );

        yield* namespaces.isolated(
          Effect.gen(function* () {
            // On Base, but a registry whose `baseNode` is not `durin-names.eth`.
            yield* pointAt(8453n, otherRegistry);
            const mismatched = yield* Actions.name.getNamespace(
              clients.make(namespaces.clientOptions()),
              { name },
            );
            assert.notStrictEqual(mismatched?.kind, "l2");

            // A chain no transport reaches: Ethereum's answer stands.
            yield* pointAt(4663n, otherRegistry);
            const unreachable = yield* Actions.name.getNamespace(
              clients.make(namespaces.clientOptions()),
              { name },
            );
            assert.deepStrictEqual(unreachable, {
              kind: "l2",
              id: "durin",
              parent: "durin-names.eth",
              chainId: 4663,
              registry: otherRegistry,
            });
          }),
        );
      }),
    );

    it.effect("locates names on an L2 the client does not reach, without their registry", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const ens = (yield* Clients).make({ deployment: namespaces.deployment });

        const basename = yield* Actions.name.getNamespace(ens, { name: "alice.base.eth" });
        const namespaceName = yield* Actions.name.getNamespace(ens, { name: "alice.ns-base.eth" });
        assert.deepInclude(basename, { kind: "l2", id: "basenames", chainId: 8453 });
        assert.deepStrictEqual(namespaceName, {
          kind: "l2",
          id: "namespace",
          parent: "ns-base.eth",
          chainId: 8453,
          registry: null,
        });
      }),
    );
  });
});
