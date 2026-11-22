import { assert, layer } from "@effect/vitest";
import { Effect, Schedule, Array as Arr } from "effect";

import { bundler, hca } from "@ensforge/hca";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Duration } from "@ensforge/sdk";
import { Actions, Ensforge } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Clients } from "@ensforge/test-integration/support/clients";
import { mintUsdc, usdcOf } from "@ensforge/test-integration/support/contracts";
import { Wallets } from "@ensforge/test-integration/support/wallets";
import { http } from "viem";

import { Services } from "../stack/stack.ts";

// How accounts send writes: a smart wallet's bundles, a gasless renewal through the owner's HCA and
// a bundler, and an app written against the `Ensforge` service. Nothing is reverted.

layer(Services.layer({ profile: "mainnet-shaped", services: ["indexer", "aa"] }), {
  excludeTestServices: true,
})("journeys: accounts", (it) => {
  it.effect("a smart wallet registers a profile, each step of several calls in one bundle", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const { accounts } = yield* Devnet;
      const chain = yield* Chain;
      const clients = yield* Clients;
      const wallets = yield* Wallets;
      const { carol } = accounts;
      const wallet = wallets.make(carol, { atomic: true });
      const ens = clients.make({ account: carol, wallet, indexer: services.indexer });
      const name = "journey-bundled.eth";

      const result = yield* Actions.registration.registerSync(ens, {
        names: name,
        duration: Duration.years(1),
        records: { texts: { url: "https://bundled.example" }, addresses: { eth: carol } },
        primaryName: true,
        onStep: chain.passWaits,
      });

      // The commit goes alone; the steps after its wait share one bundle.
      assert.deepStrictEqual(
        Arr.map(result.plan.steps, (step) => [step.id, step.calls.length]),
        [
          ["commit", 1],
          ["register", 2],
          ["primaryName", 2],
        ],
      );
      assert.deepStrictEqual(
        Arr.filter(
          wallet.methods,
          (method) => method === "eth_sendTransaction" || method === "wallet_sendCalls",
        ),
        ["eth_sendTransaction", "wallet_sendCalls"],
      );

      yield* services.waitForIndexed();
      const [found] = (yield* Actions.indexer.lookup(ens, { inputs: [carol], profile: "detail" }))
        .results;
      assert.strictEqual(found?.name?.name, name);
      assert.strictEqual(found?.name?.records?.texts["url"], "https://bundled.example");
    }),
  );

  it.effect("an owner without ETH renews through the HCA, sponsored by a paymaster", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const { accounts } = yield* Devnet;
      const chain = yield* Chain;
      const clients = yield* Clients;
      const { user } = accounts;
      const ens = clients.make({ account: user, indexer: services.indexer });
      const name = "journey-gasless.eth";

      yield* mintUsdc(user, 1_000_000_000n);
      const registered = yield* Actions.registration.registerSync(ens, {
        names: name,
        duration: Duration.years(1),
        onStep: chain.passWaits,
      });

      // The owner keeps no ETH; the HCA holds the USDC the renewal costs.
      yield* chain.setBalance(user, 0n);
      const account = yield* HcaActions.hca.predictAddress(ens, {});
      yield* mintUsdc(account, 1_000_000_000n);
      const before = yield* usdcOf(account);

      yield* Actions.registration.renewSync(ens, {
        names: name,
        duration: Duration.years(1),
        via: hca({
          executors: [bundler({ url: services.bundlerUrl, paymaster: services.paymasterUrl })],
        }),
      });

      const expiry = (registered.names[0]?.expiry ?? 0n) + Duration.years(1);
      assert.strictEqual((yield* Actions.name.get(ens, { name })).expiry, expiry);
      const userBalanceAfter = yield* chain.balance(user);
      assert.strictEqual(userBalanceAfter, 0n);
      assert.isTrue((yield* usdcOf(account)) < before, "the HCA paid the renewal");
      yield* services.waitForIndexed();
      assert.strictEqual((yield* Actions.indexer.getName(ens, { name }))?.expiresAt, expiry);
    }),
  );

  it.effect("an app reads a profile through the Ensforge service, preferring the indexer", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const devnet = yield* Devnet;
      const chain = yield* Chain;
      const clients = yield* Clients;
      const { bob } = devnet.accounts;

      yield* Actions.registration.registerSync(clients.make({ account: bob }), {
        names: "journey-app.eth",
        duration: Duration.years(1),
        records: { texts: { url: "https://app.example" }, addresses: { eth: bob } },
        primaryName: true,
        onStep: chain.passWaits,
      });

      // The app's own program depends only on the `Ensforge` service.
      const profile = Effect.gen(function* () {
        const ens = yield* Ensforge.Ensforge;
        const name = yield* Actions.primaryName.get(ens, { address: bob });
        if (name === null) return null;
        // The indexer may lag behind the chain; the chain is the fallback.
        const url = yield* Actions.indexer.getRecords(ens, { name, keys: ["text:url"] }).pipe(
          Effect.map((records) => records?.texts["url"] ?? null),
          Effect.retry({ schedule: Schedule.spaced("250 millis"), times: 3 }),
          Effect.catchTag("IndexerError", () => Actions.record.getText(ens, { name, key: "url" })),
        );
        return { name, url };
      });

      yield* services.waitForIndexed();
      const read = yield* profile.pipe(
        // The test runs `profile` against its own client; this is the program's entry point.
        // oxlint-disable-next-line effecttsgo/strict-effect-provide
        Effect.provide(
          Ensforge.layer({
            chain: devnet.chain,
            transports: { [devnet.chain.id]: http(devnet.rpcUrl) },
            publicRpc: false,
            deployment: devnet.deployments,
            indexer: services.indexer,
          }),
        ),
      );
      assert.deepStrictEqual(read, { name: "journey-app.eth", url: "https://app.example" });
    }),
  );
});
