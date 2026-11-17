import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";

import { bundler, hca } from "@ensforge/hca";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Devnet } from "@ensforge/test-devnet";
import { expectFailure } from "@ensforge/test-harness";
import { ensforge } from "@ensforge/test-integration/support/chain";
import { parseEther, type Address } from "viem";

import { Services } from "../stack/stack.ts";

// HCA executions as owner-signed UserOperations through alto (EntryPoint v0.7). The owners hold no
// ETH: the HCA pays its own gas, or the paymaster sponsors it. Nothing here is reverted, so each
// test uses its own owner.

const balanceOf = (address: Address) =>
  Effect.flatMap(Devnet, (devnet) => Effect.promise(() => devnet.client.getBalance({ address })));

layer(Services.layer({ profile: "mainnet-shaped", services: ["aa"] }), {
  excludeTestServices: true,
})("HCA through a bundler", (it) => {
  it.effect("deploys the HCA with its first UserOperation and pays gas from the HCA", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const devnet = yield* Devnet;
      const { user, bob } = devnet.accounts;
      yield* Effect.promise(() => devnet.client.setBalance({ address: user, value: 0n }));
      const ens = ensforge(devnet, { account: user });
      const address = yield* HcaActions.hca.predictAddress(ens, {});
      yield* Effect.promise(() => devnet.client.setBalance({ address, value: parseEther("1") }));
      const before = yield* balanceOf(bob);

      yield* HcaActions.hca.executeSync(ens, {
        calls: [{ to: bob, value: parseEther("0.1") }],
        via: hca({ executors: [bundler({ url: services.bundlerUrl })] }),
      });

      assert.strictEqual((yield* balanceOf(bob)) - before, parseEther("0.1"));
      assert.isTrue((yield* HcaActions.hca.get(ens, {})).deployed);
      assert.strictEqual(yield* balanceOf(user), 0n);
      assert.isTrue((yield* balanceOf(address)) < parseEther("0.9"), "the HCA paid for gas");
    }),
  );

  it.effect("runs sponsored UserOperations without touching the HCA's balance", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const devnet = yield* Devnet;
      const { user2, bob } = devnet.accounts;
      yield* Effect.promise(() => devnet.client.setBalance({ address: user2, value: 0n }));
      const ens = ensforge(devnet, { account: user2 });
      const address = yield* HcaActions.hca.predictAddress(ens, {});

      yield* HcaActions.hca.executeSync(ens, {
        calls: [{ to: bob, value: 0n }],
        via: hca({
          executors: [bundler({ url: services.bundlerUrl, paymaster: services.paymasterUrl })],
        }),
      });

      assert.isTrue((yield* HcaActions.hca.get(ens, {})).deployed);
      assert.strictEqual(yield* balanceOf(address), 0n);
    }),
  );

  it.effect("reports an operation the bundler refuses", () =>
    Effect.gen(function* () {
      const services = yield* Services;
      const devnet = yield* Devnet;
      const { nameOwner, bob } = devnet.accounts;
      const ens = ensforge(devnet, { account: nameOwner });

      // Neither the HCA nor a paymaster can pay for it.
      yield* expectFailure(
        HcaActions.hca.execute(ens, {
          calls: [{ to: bob, value: 0n }],
          via: hca({ executors: [bundler({ url: services.bundlerUrl })] }),
        }),
        { _tag: "HcaError", code: "HCA_BUNDLER_REJECTED" },
      );
    }),
  );
});
