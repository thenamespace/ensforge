import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";

import { bundler, hca } from "@ensforge/hca";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { expectFailure } from "@ensforge/test-harness";
import { Clients } from "@ensforge/test-integration/support/clients";
import { parseEther } from "viem";

import { Services } from "../stack/stack.ts";

// HCA executions as owner-signed UserOperations through alto (EntryPoint v0.7). The owners hold no
// ETH: the HCA pays its own gas, or the paymaster sponsors it. Nothing here is reverted, so each
// test uses its own owner.

layer(Services.layer({ profile: "mainnet-shaped", services: ["aa"] }), {
  excludeTestServices: true,
})("HCA through a bundler", (it) => {
  it.effect("deploys the HCA with its first UserOperation and pays gas from the HCA", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const { accounts } = yield* Devnet;
      const chain = yield* Chain;
      const clients = yield* Clients;
      const { user, bob } = accounts;
      const ens = clients.make({ account: user });
      const address = yield* HcaActions.hca.predictAddress(ens, {});
      yield* chain.setBalance(user, 0n);
      yield* chain.setBalance(address, parseEther("1"));
      const before = yield* chain.balance(bob);

      yield* HcaActions.hca.executeSync(ens, {
        calls: [{ to: bob, value: parseEther("0.1") }],
        via: hca({ executors: [bundler({ url: services.bundlerUrl })] }),
      });

      assert.strictEqual((yield* chain.balance(bob)) - before, parseEther("0.1"));
      assert.isTrue((yield* HcaActions.hca.get(ens, {})).deployed);
      assert.strictEqual(yield* chain.balance(user), 0n);
      assert.isTrue((yield* chain.balance(address)) < parseEther("0.9"), "the HCA paid for gas");
    }),
  );

  it.effect("runs sponsored UserOperations without touching the HCA's balance", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const { accounts } = yield* Devnet;
      const chain = yield* Chain;
      const clients = yield* Clients;
      const { user2, bob } = accounts;
      const ens = clients.make({ account: user2 });
      const address = yield* HcaActions.hca.predictAddress(ens, {});
      yield* chain.setBalance(user2, 0n);

      yield* HcaActions.hca.executeSync(ens, {
        calls: [{ to: bob, value: 0n }],
        via: hca({
          executors: [bundler({ url: services.bundlerUrl, paymaster: services.paymasterUrl })],
        }),
      });

      assert.isTrue((yield* HcaActions.hca.get(ens, {})).deployed);
      assert.strictEqual(yield* chain.balance(address), 0n);
    }),
  );

  it.effect("reports an operation the bundler refuses", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const { accounts } = yield* Devnet;
      const clients = yield* Clients;
      const ens = clients.make({ account: accounts.nameOwner });

      // Neither the HCA nor a paymaster can pay for it.
      yield* expectFailure(
        HcaActions.hca.execute(ens, {
          calls: [{ to: accounts.bob, value: 0n }],
          via: hca({ executors: [bundler({ url: services.bundlerUrl })] }),
        }),
        { _tag: "HcaError", code: "HCA_BUNDLER_REJECTED" },
      );
    }),
  );
});
