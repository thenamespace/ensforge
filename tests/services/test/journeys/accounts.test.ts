import { assert, layer } from "@effect/vitest";
import { Effect, Schedule } from "effect";

import { bundler, hca } from "@ensforge/hca";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Actions, Ensforge } from "@ensforge/sdk/effect";
import { bigname } from "@ensforge/sdk/indexer";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { ensforge, passWaits } from "@ensforge/test-integration/support/chain";
import { testWallet } from "@ensforge/test-integration/support/wallet";
import { mintUsdc, usdcOf } from "@ensforge/test-integration/writes/support";
import { createPublicClient, http, type Address } from "viem";

import { Services, type ServicesApi } from "../stack/stack.ts";

// How accounts send writes: a smart wallet's bundles, a gasless renewal through the owner's HCA and
// a bundler, and an app written against the `Ensforge` service. Nothing is reverted.

const year = 31_536_000n;

const client = (devnet: DevnetInstance, services: ServicesApi, account: Address) =>
  ensforge(devnet, { account, indexer: bigname({ url: services.indexerUrl }) });

/** An app's own program: it depends only on the `Ensforge` service. */
const profileOf = (address: Address) =>
  Effect.gen(function* () {
    const ens = yield* Ensforge.Ensforge;
    const name = yield* Actions.primaryName.get(ens, { address });
    if (name === null) return null;
    // The indexer may lag behind the chain; the chain is the fallback.
    const url = yield* Actions.indexer.getRecords(ens, { name, keys: ["text:url"] }).pipe(
      Effect.map((records) => records?.texts["url"] ?? null),
      Effect.retry({ schedule: Schedule.spaced("250 millis"), times: 3 }),
      Effect.catchTag("IndexerError", () => Actions.record.getText(ens, { name, key: "url" })),
    );
    return { name, url };
  });

layer(Services.layer({ profile: "mainnet-shaped", services: ["indexer", "aa"] }), {
  excludeTestServices: true,
})("journeys: accounts", (it) => {
  it.effect("a smart wallet registers a profile, each step of several calls in one bundle", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const devnet = yield* Devnet;
      const { carol } = devnet.accounts;
      const wallet = testWallet(devnet, carol, { atomic: true });
      const ens = ensforge(devnet, {
        account: carol,
        wallet,
        indexer: bigname({ url: services.indexerUrl }),
      });
      const name = "journey-bundled.eth";

      const result = yield* Actions.registration.registerSync(ens, {
        names: name,
        duration: year,
        records: { texts: { url: "https://bundled.example" }, addresses: { eth: carol } },
        primaryName: true,
        onStep: passWaits(devnet),
      });

      const bundled = result.plan.steps.filter((step) => step.calls.length > 1).length;
      assert.isAbove(bundled, 0);
      assert.strictEqual(
        wallet.methods.filter((method) => method === "wallet_sendCalls").length,
        bundled,
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
      const devnet = yield* Devnet;
      const { user } = devnet.accounts;
      const ens = client(devnet, services, user);
      const name = "journey-gasless.eth";

      yield* mintUsdc(devnet, user, 1_000_000_000n);
      const registered = yield* Actions.registration.registerSync(ens, {
        names: name,
        duration: year,
        onStep: passWaits(devnet),
      });

      // The owner keeps no ETH; the HCA holds the USDC the renewal costs.
      yield* Effect.promise(() => devnet.client.setBalance({ address: user, value: 0n }));
      const account = yield* HcaActions.hca.predictAddress(ens, {});
      yield* mintUsdc(devnet, account, 1_000_000_000n);
      const before = yield* usdcOf(devnet, account);

      yield* Actions.registration.renewSync(ens, {
        names: name,
        duration: year,
        via: hca({
          executors: [bundler({ url: services.bundlerUrl, paymaster: services.paymasterUrl })],
        }),
      });

      const expiry = (registered.names[0]?.expiry ?? 0n) + year;
      assert.strictEqual((yield* Actions.name.get(ens, { name })).expiry, expiry);
      assert.strictEqual(
        yield* Effect.promise(() => devnet.client.getBalance({ address: user })),
        0n,
      );
      assert.isTrue((yield* usdcOf(devnet, account)) < before, "the HCA paid the renewal");
      yield* services.waitForIndexed();
      assert.strictEqual((yield* Actions.indexer.getName(ens, { name }))?.expiresAt, expiry);
    }),
  );

  it.effect("an app reads a profile through the Ensforge service, preferring the indexer", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const devnet = yield* Devnet;
      const { carol } = devnet.accounts;

      yield* services.waitForIndexed();
      const profile = yield* profileOf(carol).pipe(
        Effect.provide(
          Ensforge.layer({
            publicClient: createPublicClient({
              chain: devnet.chain,
              transport: http(devnet.rpcUrl),
            }),
            deployment: devnet.deployments,
            indexer: bigname({ url: services.indexerUrl }),
          }),
        ),
      );
      assert.deepStrictEqual(profile, {
        name: "journey-bundled.eth",
        url: "https://bundled.example",
      });
    }),
  );
});
