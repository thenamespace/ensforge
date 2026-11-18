import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Actions as PromiseActions, Ensforge, type Plan } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure, expectRejection, noRpc, scriptedTransport } from "@ensforge/test-harness";
import { createClient, createPublicClient, createWalletClient, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet, optimism, sepolia } from "viem/chains";

const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);

// `plan.send` plans without reading the chain, so the signer is the first thing it needs.
const emptyPlan = (chainId: number): Plan => ({
  id: "test-plan",
  operation: "test",
  chainId,
  account: undefined,
  steps: [],
  calls: [],
  requirements: [],
  warnings: [],
  deploys: [],
});

/** A public client that must not be asked anything. */
const publicClient = (chain: Chain = mainnet) => {
  const { transport, calls } = scriptedTransport(noRpc);
  return { client: createPublicClient({ chain, transport }), calls };
};

// The first case also checks the Promise form; the signer is resolved the same way for both.
describe("write signer resolution", () => {
  it.effect("fails with WALLET_NOT_CONFIGURED without a wallet", () =>
    Effect.gen(function* () {
      const { client, calls } = publicClient();
      const ens = Ensforge.create({ publicClient: client });

      yield* expectRejection(() => PromiseActions.plan.send(ens, { plan: emptyPlan(1) }), {
        _tag: "ConfigError",
        code: "WALLET_NOT_CONFIGURED",
      });
      const error = yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(1) }), {
        _tag: "ConfigError",
        code: "WALLET_NOT_CONFIGURED",
      });

      assert.strictEqual(error.context.operation, "plan.send");
      assert.lengthOf(calls, 0);
    }),
  );

  it.effect("fails with WALLET_NOT_CONFIGURED when the wallet getter returns nothing", () =>
    Effect.gen(function* () {
      const { client } = publicClient();
      const ens = Ensforge.create({ publicClient: client, walletClient: async () => undefined });

      yield* expectFailure(Actions.plan.sendSync(ens, { plan: emptyPlan(1) }), {
        _tag: "ConfigError",
        code: "WALLET_NOT_CONFIGURED",
      });
    }),
  );

  it.effect("fails with ACCOUNT_NOT_FOUND for a wallet without an account", () =>
    Effect.gen(function* () {
      const { client } = publicClient();
      const { transport, calls } = scriptedTransport(noRpc);
      const walletClient = createWalletClient({ chain: mainnet, transport });
      const ens = Ensforge.create({ publicClient: client, walletClient });

      yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(1) }), {
        _tag: "WalletError",
        code: "ACCOUNT_NOT_FOUND",
      });

      assert.lengthOf(calls, 0);
    }),
  );

  it.effect(
    "fails with CHAIN_MISMATCH for a wallet on another chain",
    () =>
      Effect.gen(function* () {
        const { client } = publicClient(mainnet);
        const { transport } = scriptedTransport(noRpc);
        const walletClient = createWalletClient({ chain: sepolia, transport, account: signer });
        const ens = Ensforge.create({ publicClient: client, walletClient });

        const error = yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(1) }), {
          _tag: "WalletError",
          code: "CHAIN_MISMATCH",
        });

        assert.strictEqual(error.expectedChainId, 1);
        assert.strictEqual(error.actualChainId, sepolia.id);
      }),
    { meta: { cases: ["A10"] } },
  );

  it.effect("asks a wallet without a chain for its chain ID", () =>
    Effect.gen(function* () {
      const { client } = publicClient(sepolia);
      // The scripted wallet answers `eth_chainId` with mainnet.
      const { transport, calls } = scriptedTransport(noRpc);
      const walletClient = createClient({ transport, account: signer });
      const ens = Ensforge.create({ publicClient: client, walletClient });

      const error = yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(sepolia.id) }), {
        _tag: "WalletError",
        code: "CHAIN_MISMATCH",
      });

      assert.strictEqual(error.expectedChainId, sepolia.id);
      assert.strictEqual(error.actualChainId, 1);
      assert.deepStrictEqual(
        calls.map((call) => call.method),
        ["eth_chainId"],
      );
    }),
  );

  it.effect("checks a plan for one of the client's chains against that chain's wallet", () =>
    Effect.gen(function* () {
      const { transport } = scriptedTransport(noRpc);
      const ens = Ensforge.create({
        publicClient: publicClient(mainnet).client,
        walletClient: createWalletClient({ chain: mainnet, transport, account: signer }),
        chains: {
          [optimism.id]: {
            publicClient: publicClient(optimism).client,
            walletClient: createWalletClient({ chain: base, transport, account: signer }),
          },
        },
      });

      const error = yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(optimism.id) }), {
        _tag: "WalletError",
        code: "CHAIN_MISMATCH",
      });

      assert.strictEqual(error.expectedChainId, optimism.id);
      assert.strictEqual(error.actualChainId, base.id);
    }),
  );

  it.effect("checks the plan before the wallet", () =>
    Effect.gen(function* () {
      const { client } = publicClient();
      const ens = Ensforge.create({ publicClient: client });

      yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(sepolia.id) }), {
        _tag: "PlanError",
        code: "PLAN_CHAIN_MISMATCH",
      });
    }),
  );

  it.effect("prepares without a wallet", () =>
    Effect.gen(function* () {
      const { client, calls } = publicClient();
      const ens = Ensforge.create({ publicClient: client });
      const plan = emptyPlan(1);

      const prepared = yield* Actions.plan.send.prepare(ens, { plan });

      assert.deepStrictEqual(prepared, plan);
      assert.lengthOf(calls, 0);
    }),
  );
});
