import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

import { call, ensforge, isolated, onProfile } from "../support/chain.ts";
import { testWallet } from "../support/wallet.ts";

describe("write send modes", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("signs as the account a write names, not the client's", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const { accounts } = devnet;
        // The client signs as alice; bob owns the records.
        const ens = ensforge(devnet, { account: accounts.alice });
        const name = fixtures.byId("records.v2").name;

        yield* isolated(
          devnet,
          Effect.gen(function* () {
            const { receipt } = yield* call(() =>
              ens.record.setSync({
                name,
                texts: { url: "https://bob.example" },
                account: accounts.bob,
              }),
            );
            assert.strictEqual(receipt.from.toLowerCase(), accounts.bob.toLowerCase());
          }),
        );
      }),
    );

    // Writing records to a new resolver and switching to it is one step of two calls.
    it.effect("bundles a step's calls when the wallet supports atomic batches", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const alice = devnet.accounts.alice;
        const options = {
          name: fixtures.byId("records.v1").name,
          texts: { url: "https://moved.example" },
          resolver: "default",
        } as const;
        const sendWith = (atomic: boolean, extra: Record<string, unknown> = {}) =>
          isolated(
            devnet,
            Effect.gen(function* () {
              const wallet = testWallet(devnet, alice, { atomic });
              const ens = ensforge(devnet, { account: alice, wallet });
              const result = yield* call(() => ens.record.setSync({ ...options, ...extra }));
              return {
                result,
                sendCalls: wallet.methods.filter((m) => m === "wallet_sendCalls").length,
              };
            }),
          );

        const bundled = yield* sendWith(true);
        assert.deepInclude(bundled, { sendCalls: 1 });
        assert.isDefined(bundled.result.id);
        assert.strictEqual(bundled.result.hashes.length, 2);

        const sequential = yield* sendWith(false);
        assert.deepInclude(sequential, { sendCalls: 0 });
        assert.isUndefined(sequential.result.id);
        assert.strictEqual(sequential.result.hashes.length, 2);

        // A step's calls stay together whatever the limit: they must not land apart.
        assert.deepInclude(yield* sendWith(true, { maxBundleCalls: 1 }), { sendCalls: 1 });
      }),
    );

    // Carol pays in USDC she has not approved: an `approve` step, then two renewal calls.
    it.effect("joins consecutive steps in one bundle up to maxBundleCalls", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const carol = devnet.accounts.carol;
        const options = {
          names: [fixtures.byId("v2.registered").name, fixtures.byId("v2.reserved").name],
          duration: 31_536_000n,
        };
        const bundlesFor = (extra: Record<string, unknown>) =>
          isolated(
            devnet,
            Effect.gen(function* () {
              const wallet = testWallet(devnet, carol, { atomic: true });
              const ens = ensforge(devnet, { account: carol, wallet });
              const result = yield* call(() =>
                ens.registration.renewSync({ ...options, ...extra }),
              );
              assert.strictEqual(result.hashes.length, 3);
              const count = (method: string) => wallet.methods.filter((m) => m === method).length;
              return [count("wallet_sendCalls"), count("eth_sendTransaction")];
            }),
          );

        // [bundles, plain transactions]
        assert.deepStrictEqual(yield* bundlesFor({}), [1, 0]);
        // Over the limit, the one-call approval goes alone, as a plain transaction.
        assert.deepStrictEqual(yield* bundlesFor({ maxBundleCalls: 2 }), [1, 1]);
      }),
    );
  });
});
