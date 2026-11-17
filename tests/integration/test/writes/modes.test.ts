import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { isAddressEqual } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

describe("write send modes", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("signs as the account a write names, not the client's", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        // The client signs as alice; bob owns the records.
        const ens = clients.make({ account: accounts.alice });

        yield* chain.isolated(
          Effect.gen(function* () {
            const { receipt } = yield* Actions.record.setSync(ens, {
              name: fixtures.byId("records.v2").name,
              texts: { url: "https://bob.example" },
              account: accounts.bob,
            });
            assert.isTrue(isAddressEqual(receipt.from, accounts.bob));
          }),
        );
      }),
    );

    // Writing records to a new resolver and switching to it is one step of two calls.
    it.effect("bundles a step's calls when the wallet supports atomic batches", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const wallets = yield* Wallets;
        const options = {
          name: fixtures.byId("records.v1").name,
          texts: { url: "https://moved.example" },
          resolver: "default",
        } as const;
        const sendWith = (atomic: boolean, maxBundleCalls?: number) =>
          chain.isolated(
            Effect.gen(function* () {
              const wallet = wallets.make(accounts.alice, { atomic });
              const ens = clients.make({ account: accounts.alice, wallet });
              const result = yield* Actions.record.setSync(ens, { ...options, maxBundleCalls });
              const sendCalls = wallet.methods.filter((method) => method === "wallet_sendCalls");
              return { result, sendCalls: sendCalls.length };
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
        assert.deepInclude(yield* sendWith(true, 1), { sendCalls: 1 });
      }),
    );

    // Carol pays in USDC she has not approved: an `approve` step, then two renewal calls.
    it.effect("joins consecutive steps in one bundle up to maxBundleCalls", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const wallets = yield* Wallets;
        const options = {
          names: [fixtures.byId("v2.registered").name, fixtures.byId("v2.reserved").name],
          duration: Duration.years(1),
        };
        // [bundles, plain transactions]
        const sendsWith = (maxBundleCalls?: number) =>
          chain.isolated(
            Effect.gen(function* () {
              const wallet = wallets.make(accounts.carol, { atomic: true });
              const ens = clients.make({ account: accounts.carol, wallet });
              const result = yield* Actions.registration.renewSync(ens, {
                ...options,
                maxBundleCalls,
              });
              assert.strictEqual(result.hashes.length, 3);

              const count = (method: string) => wallet.methods.filter((m) => m === method).length;
              return [count("wallet_sendCalls"), count("eth_sendTransaction")];
            }),
          );

        assert.deepStrictEqual(yield* sendsWith(), [1, 0]);
        // Over the limit, the one-call approval goes alone, as a plain transaction.
        assert.deepStrictEqual(yield* sendsWith(2), [1, 1]);
      }),
    );
  });
});
