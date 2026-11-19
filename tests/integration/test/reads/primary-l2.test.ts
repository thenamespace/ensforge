import { assert, describe, layer } from "@effect/vitest";
import { Array as Arr, Effect, Layer } from "effect";

import { Actions as Requests, CoinType } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { parseAbi } from "viem";

import { Clients } from "../support/clients.ts";
import { Gateways } from "../support/gateways.ts";
import { chainServices } from "../support/lane.ts";
import { Namespaces } from "../support/namespaces.ts";

// L2 primary names are read on the L2 when the client reaches it (ENSIP-19 on the chain itself:
// its L2ReverseRegistrar, then the default name, then the forward check), and through Ethereum's
// proof of the L2 otherwise. A failing Ethereum path shows that the L2 path does not use it.

const services = Namespaces.layer.pipe(
  Layer.provideMerge(chainServices),
  Layer.provideMerge(Fixtures.layer({ profile: "mainnet-shaped" })),
);

const chains = [8453, 10, 59144] as const;

describe("primaryName.get on L2s", () => {
  layer(services, { excludeTestServices: true })("mainnet-shaped", (it) => {
    it.effect(
      "reads each L2's primary name on the L2, and through Ethereum without it",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const clients = yield* Clients;
          const gateways = yield* Gateways;
          const chain = yield* Chain;
          const devnet = yield* Devnet;
          const { alice } = devnet.accounts;
          const name = (yield* Fixtures).byId("records.v1").name;
          const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });

          yield* namespaces.isolated(
            Effect.gen(function* () {
              for (const chainId of chains) {
                yield* Actions.record.setSync(ens, {
                  name,
                  addresses: { [String(CoinType.fromChainId(chainId))]: alice },
                });
                yield* Actions.primaryName.setSync(ens, { name, coin: { chainId } });
                const onL2 = yield* Actions.primaryName.get(ens, {
                  address: alice,
                  coin: { chainId },
                });
                const throughEthereum = yield* Actions.primaryName.get(clients.reader, {
                  address: alice,
                  coin: { chainId },
                });
                assert.strictEqual(onL2, name, String(chainId));
                assert.strictEqual(throughEthereum, name, String(chainId));
              }

              // Ethereum's path fails from here on; the L2 path does not use it.
              const failing = yield* gateways.serve(() => ({ status: 500, body: "{}" }));
              yield* chain.write({
                account: devnet.accounts.owner,
                address: devnet.contract("mock.gatewayResolver"),
                abi: parseAbi(["function setUrl(string)"]),
                functionName: "setUrl",
                args: [failing.url],
              });
              const base = { chainId: 8453 } as const;
              const onL2 = yield* Actions.primaryName.get(ens, { address: alice, coin: base });
              assert.strictEqual(onL2, name);
              const unreachable = yield* expectFailure(
                Actions.primaryName.get(clients.reader, { address: alice, coin: base }),
                { _tag: "GatewayError" },
              );
              assert.include(unreachable.hint, "give the client a transport for chain 8453");
              // A past block is Ethereum's: it is read there, whatever the client reaches.
              const blockNumber = yield* chain.blockNumber;
              yield* expectFailure(
                Actions.primaryName.get(ens, { address: alice, coin: base, blockNumber }),
                { _tag: "GatewayError" },
              );
            }),
          );
        }),
      { meta: { cases: ["P41"] } },
    );

    it.effect(
      "falls back to the default name, and verifies the name resolves back",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const clients = yield* Clients;
          const { alice, bob } = (yield* Devnet).accounts;
          const name = (yield* Fixtures).byId("records.v1").name;
          const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });
          const base = { chainId: 8453 } as const;
          const baseCoin = String(CoinType.fromChainId(8453));

          yield* namespaces.isolated(
            Effect.gen(function* () {
              // No Base name of its own: the default name, verified against the default address
              // (the fixture's own Base address is cleared, so the default one applies).
              yield* Actions.record.setSync(ens, {
                name,
                addresses: { [baseCoin]: null, [String(CoinType.fromChainId(0))]: alice },
              });
              yield* Actions.primaryName.setSync(ens, { name, coin: "default" });
              const fallback = yield* Actions.primaryName.get(ens, { address: alice, coin: base });
              assert.strictEqual(fallback, name);

              // A Base address of someone else's: the name no longer resolves back.
              yield* Actions.record.setSync(ens, { name, addresses: { [baseCoin]: bob } });
              const mismatch = yield* Actions.primaryName.get(ens, { address: alice, coin: base });
              const unverified = yield* Actions.primaryName.get(ens, {
                address: alice,
                coin: base,
                verify: false,
              });
              assert.isNull(mismatch);
              assert.strictEqual(unverified, name);
              yield* expectFailure(
                Actions.primaryName.get(ens, { address: alice, coin: base, strict: true }),
                { _tag: "NotFoundError", code: "PRIMARY_NAME_MISMATCH" },
              );
            }),
          );
        }),
      { meta: { cases: ["P42"] } },
    );

    it.effect("takes a Basename as a Base primary name, verified on Base", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const clients = yield* Clients;
        const { alice } = (yield* Devnet).accounts;
        const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });
        const name = "alice.base.eth";
        const base = { chainId: 8453 } as const;

        yield* namespaces.isolated(
          Effect.gen(function* () {
            yield* Actions.record.setSync(ens, {
              name,
              addresses: { [String(CoinType.fromChainId(8453))]: alice },
            });
            yield* Actions.primaryName.setSync(ens, { name, coin: base });
            const primaryName = yield* Actions.primaryName.get(ens, { address: alice, coin: base });
            const registered = yield* namespaces.nameOf(8453, alice);
            assert.strictEqual(primaryName, name);
            assert.strictEqual(registered, name);
          }),
        );
      }),
    );

    it.effect("sends L2 reverse records through a route, and batches reads per chain", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const clients = yield* Clients;
        const { alice } = (yield* Devnet).accounts;
        const name = (yield* Fixtures).byId("records.v1").name;
        const ens = clients.make({ account: alice, ...namespaces.clientOptions(alice) });

        yield* namespaces.isolated(
          Effect.gen(function* () {
            yield* Actions.record.setSync(ens, {
              name,
              addresses: { [String(CoinType.fromChainId(0))]: alice },
            });
            // L2 reverse records took routes in 1.0; writes on L2 namespace names do not.
            yield* Actions.primaryName.setSync(ens, {
              name,
              coin: { chainId: 10 },
              via: { id: "relay", prepare: (plan) => Promise.resolve(plan) },
            });
            const registered = yield* namespaces.nameOf(10, alice);
            assert.strictEqual(registered, name);

            const coins = [{ chainId: 10 }, { chainId: 8453 }, "eth"] as const;
            const { results } = yield* Actions.batch(ens, {
              requests: Arr.map(coins, (coin) =>
                Requests.primaryName.get.request({ address: alice, coin }),
              ),
            });
            const direct = yield* Effect.forEach(
              coins,
              (coin) => Actions.primaryName.get(ens, { address: alice, coin }),
              { concurrency: 1 },
            );
            assert.deepStrictEqual<unknown>(
              Arr.map(results, (result) => (result.status === "success" ? result.result : result)),
              direct,
            );

            yield* expectFailure(Actions.primaryName.set(ens, { name, coin: { chainId: 42220 } }), {
              _tag: "UnsupportedError",
              code: "UNSUPPORTED_ON_DEPLOYMENT",
            });
          }),
        );
      }),
    );
  });
});
