import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Formatter, Option, Record as Rec, String as Str } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { getAddress, namehash, toFunctionSelector, zeroAddress, type Address } from "viem";

import { clientFor, signer } from "../world.js";

// Where names no registry holds live, from the resolver an ancestor sets: mainnet's L2 namespaces
// (`Deployments.mainnet.namespaces`) and off-chain providers. The scripted client reaches no L2,
// so Durin is trusted from Ethereum and Namespace registries stay unknown.

const { basenames, durin, namespace } = Deployments.mainnet.namespaces;
const registry = getAddress("0x00000000000000000000000000000000000000d1");

/** `name` served by `resolver`, set on its ancestor `parent`. */
const served = (
  name: string,
  parent: string,
  resolver: Address,
  world: Partial<Parameters<typeof clientFor>[0]> = {},
) =>
  clientFor({
    name,
    names: { [parent]: { v1: { owner: signer, resolver } } },
    // `findResolver` reports the byte offset of the ancestor in the DNS-encoded name.
    found: { resolver, offset: BigInt(name.length - parent.length) },
    extended: [resolver],
    ...world,
  });

/** Durin's Ethereum resolver, keying `warpl.eth` to `target` on Base. */
const durinRegistry = (target: Address) => ({
  address: durin.l1Resolver,
  abi: Abis.durin.l1Resolver,
  functions: {
    l2Registry: ([node]: readonly unknown[]) =>
      node === namehash("warpl.eth") ? [8453n, target] : [0n, zeroAddress],
  },
});

describe("name.getNamespace", () => {
  it.effect(
    "locates a Basename on Base from the deployment's namespaces, as name.get does",
    () =>
      Effect.gen(function* () {
        const { ens } = served("jesse.base.eth", "base.eth", basenames.l1Resolver);
        const expected = {
          kind: "l2",
          id: "basenames",
          parent: "base.eth",
          chainId: 8453,
          registry: basenames.contracts.registry,
        } as const;

        const located = yield* Actions.name.getNamespace(ens, { name: "jesse.base.eth" });
        const state = yield* Actions.name.get(ens, { name: "jesse.base.eth" });
        assert.deepStrictEqual(located, expected);
        assert.deepInclude(state, {
          kind: "l2",
          status: "external",
          chainId: 8453,
          namespace: expected,
        });
      }),
    { meta: { cases: ["N01"] } },
  );

  it.effect("does not take a name outside the namespace's parent for it", () =>
    Effect.gen(function* () {
      const { ens } = served("alice.other.eth", "other.eth", basenames.l1Resolver, {
        served: { [basenames.l1Resolver]: "offchain" },
      });

      const located = yield* Actions.name.getNamespace(ens, { name: "alice.other.eth" });
      assert.deepStrictEqual(located, { kind: "offchain", provider: null, parent: "other.eth" });
    }),
  );

  it.effect(
    "names the off-chain provider whose resolver serves a name",
    () =>
      Effect.gen(function* () {
        const coinbase = Deployments.offchainProviders.coinbase;
        const [resolver] = coinbase.resolvers;
        const { ens } = served("jesse.cb.id", "cb.id", resolver, {
          served: { [resolver]: "offchain" },
        });

        const located = yield* Actions.name.getNamespace(ens, { name: "jesse.cb.id" });
        const state = yield* Actions.name.get(ens, { name: "jesse.cb.id" });
        assert.deepStrictEqual(located, { kind: "offchain", provider: coinbase, parent: "cb.id" });
        assert.deepInclude(state, { kind: "offchain", chainId: 1 });
      }),
    { meta: { cases: ["N22"] } },
  );

  it.effect(
    "locates a Durin name through its second-level name's L2 registry",
    () =>
      Effect.gen(function* () {
        const deep = served("x.y.warpl.eth", "warpl.eth", durin.l1Resolver, {
          stubs: [durinRegistry(registry)],
        });
        const unset = served("x.warpl.eth", "warpl.eth", durin.l1Resolver, {
          stubs: [durinRegistry(zeroAddress)],
          served: { [durin.l1Resolver]: "offchain" },
        });

        // Durin keys the second-level name, whatever the depth.
        const located = yield* Actions.name.getNamespace(deep.ens, { name: "x.y.warpl.eth" });
        // A parent on Durin's resolver without a registry is served by its gateway alone.
        const gatewayOnly = yield* Actions.name.getNamespace(unset.ens, { name: "x.warpl.eth" });
        assert.deepStrictEqual(located, {
          kind: "l2",
          id: "durin",
          parent: "warpl.eth",
          chainId: 8453,
          registry,
        });
        assert.deepStrictEqual(gatewayOnly, {
          kind: "offchain",
          provider: null,
          parent: "warpl.eth",
        });
      }),
    { meta: { cases: ["N11"] } },
  );

  it.effect(
    "locates Namespace names from the nearest configured ancestor or the V2 route",
    () =>
      Effect.gen(function* () {
        const { current, v2 } = namespace.hybridResolvers;
        const configs = (types: Readonly<Record<string, bigint>>) => ({
          address: current,
          abi: Abis.namespace.hybridResolver,
          functions: {
            configs: ([node]: readonly unknown[]) => [
              false,
              Arr.findFirst(Rec.toEntries(types), ([level]) => namehash(level) === node).pipe(
                Option.match({ onNone: () => 0n, onSome: ([, type]) => type }),
              ),
            ],
          },
        });
        const onBase = served("a.b.gotbased.eth", "gotbased.eth", current, {
          stubs: [configs({ "gotbased.eth": 8453n })],
        });
        const offchain = served("test.calderans.eth", "calderans.eth", current, {
          stubs: [configs({ "calderans.eth": 9999n })],
          served: { [current]: "offchain" },
        });
        const routed = served("x.routed.eth", "routed.eth", v2, {
          stubs: [
            {
              address: v2,
              abi: Abis.namespace.hybridResolverV2,
              functions: { findRoute: () => 3n },
            },
          ],
        });

        const base = yield* Actions.name.getNamespace(onBase.ens, { name: "a.b.gotbased.eth" });
        const database = yield* Actions.name.getNamespace(offchain.ens, {
          name: "test.calderans.eth",
        });
        const route = yield* Actions.name.getNamespace(routed.ens, { name: "x.routed.eth" });
        assert.deepStrictEqual(base, {
          kind: "l2",
          id: "namespace",
          parent: "gotbased.eth",
          chainId: 8453,
          registry: null,
        });
        assert.deepStrictEqual(database, {
          kind: "offchain",
          provider: Deployments.offchainProviders.namespace,
          parent: "calderans.eth",
        });
        // Route 3 is OP Mainnet on mainnet.
        assert.deepInclude(route, { kind: "l2", id: "namespace", chainId: 10 });
      }),
    { meta: { cases: ["N13", "N14", "N15", "N16"] } },
  );

  it.effect("is null for names in ENS", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name: "alice.eth", v1: { owner: signer } });
      const located = yield* Actions.name.getNamespace(ens, { name: "alice.eth" });
      assert.isNull(located);
    }),
  );

  it.effect("remembers a name's location for a minute on the same client", () =>
    Effect.gen(function* () {
      const { ens, calls } = served("x.warpl.eth", "warpl.eth", durin.l1Resolver, {
        stubs: [durinRegistry(registry)],
      });
      const selector = toFunctionSelector("l2Registry(bytes32)");

      yield* Actions.name.getNamespace(ens, { name: "x.warpl.eth" });
      yield* Actions.name.getNamespace(ens, { name: "x.warpl.eth" });
      const locatorReads = Arr.filter(calls, (call) =>
        Str.includes(selector)(Formatter.formatJson(call.params)),
      );
      assert.lengthOf(locatorReads, 1);
    }),
  );
});
