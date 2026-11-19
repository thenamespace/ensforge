import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, String as Str } from "effect";

import { Actions as PromiseActions, Ensforge, type Plan } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { chainClient } from "@ensforge/sdk/internal/internal/write/chain";
import { resolveSigner } from "@ensforge/sdk/internal/internal/write/signer";
import {
  expectFailure,
  expectRejection,
  noRpc,
  scriptedTransport,
  type RecordedCall,
} from "@ensforge/test-harness";
import { createClient, createWalletClient, custom, numberToHex, type EIP1193RequestFn } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet, optimism, sepolia } from "viem/chains";

const signer = privateKeyToAccount(`0x${Str.repeat(32)("11")}`);

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

/** A client on mainnet and OP whose transports must not be asked anything, and no public RPCs. */
const clientWith = (options: Partial<Ensforge.CreateOptions> = {}) => {
  const { transport, calls } = scriptedTransport(noRpc);
  const ens = Ensforge.create({
    chain: mainnet,
    transports: { [mainnet.id]: transport, [optimism.id]: transport },
    publicRpc: false,
    ...options,
  });
  return { ens, calls };
};

/**
 * A browser wallet on mainnet that switches chains when asked (EIP-3326), unless `switching`
 * answers otherwise (an error to throw).
 */
const browserWallet = (switching?: Error) => {
  const calls: RecordedCall[] = [];
  let chainId: number = mainnet.id;
  // viem's `request` is generic over every RPC method, which a mock cannot satisfy type by type.
  /* oxlint-disable effecttsgo/async-function, typescript/no-unsafe-type-assertion */
  const request = (async ({ method, params }: { method: string; params?: unknown }) => {
    calls.push({ method, params });
    if (method === "eth_chainId") return numberToHex(chainId);
    if (method === "wallet_switchEthereumChain") {
      if (switching !== undefined) throw switching;
      chainId = Number((params as readonly [{ readonly chainId: string }])[0].chainId);
      return null;
    }
    throw new Error(`Unexpected wallet request: ${method}`);
  }) as EIP1193RequestFn;
  /* oxlint-enable effecttsgo/async-function, typescript/no-unsafe-type-assertion */
  return { wallet: createClient({ transport: custom({ request }), account: signer }), calls };
};

// The first case also checks the Promise form; the signer is resolved the same way for both.
describe("write signer resolution", () => {
  it.effect("fails with WALLET_NOT_CONFIGURED without a wallet", () =>
    Effect.gen(function* () {
      const { ens, calls } = clientWith();

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
      const { ens } = clientWith({ wallet: () => Promise.resolve(undefined) });

      yield* expectFailure(Actions.plan.sendSync(ens, { plan: emptyPlan(1) }), {
        _tag: "ConfigError",
        code: "WALLET_NOT_CONFIGURED",
      });
    }),
  );

  it.effect("fails with ACCOUNT_NOT_FOUND for a wallet without an account", () =>
    Effect.gen(function* () {
      const { transport, calls } = scriptedTransport(noRpc);
      const { ens } = clientWith({ wallet: createWalletClient({ chain: mainnet, transport }) });

      yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(1) }), {
        _tag: "WalletError",
        code: "ACCOUNT_NOT_FOUND",
      });

      assert.lengthOf(calls, 0);
    }),
  );

  it.effect(
    "fails with CHAIN_MISMATCH for a wallet on another chain when switching is off",
    () =>
      Effect.gen(function* () {
        const { transport } = scriptedTransport(noRpc);
        const { ens } = clientWith({
          wallet: createWalletClient({ chain: sepolia, transport, account: signer }),
          switchChain: false,
        });

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
      // The scripted wallet answers `eth_chainId` with mainnet.
      const { transport, calls } = scriptedTransport(noRpc);
      const { ens } = clientWith({
        wallet: createClient({ transport, account: signer }),
        switchChain: false,
      });

      const error = yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(optimism.id) }), {
        _tag: "WalletError",
        code: "CHAIN_MISMATCH",
      });

      assert.strictEqual(error.expectedChainId, optimism.id);
      assert.strictEqual(error.actualChainId, 1);
      assert.deepStrictEqual(
        Arr.map(calls, (call) => call.method),
        ["eth_chainId", "eth_chainId"],
      );
    }),
  );

  // One wallet signs on every chain: a write on another chain asks it to switch first.
  it.effect("switches the wallet to the chain of the write", () =>
    Effect.gen(function* () {
      const { wallet, calls } = browserWallet();
      const { ens } = clientWith({ wallet });

      const onOptimism = yield* chainClient(ens, optimism.id);
      const resolved = yield* resolveSigner(onOptimism, undefined);

      assert.strictEqual(resolved.account, signer);
      assert.strictEqual(resolved.walletClient.chain?.id, optimism.id);
      assert.deepInclude(calls, {
        method: "wallet_switchEthereumChain",
        params: [{ chainId: numberToHex(optimism.id) }],
      });
    }),
  );

  it.effect("fails with CHAIN_MISMATCH when the wallet cannot switch", () =>
    Effect.gen(function* () {
      const { wallet } = browserWallet(
        Object.assign(new Error("Unrecognized chain ID."), { code: 4902 }),
      );
      const { ens } = clientWith({ wallet });

      const error = yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(optimism.id) }), {
        _tag: "WalletError",
        code: "CHAIN_MISMATCH",
      });

      assert.strictEqual(error.expectedChainId, optimism.id);
      assert.strictEqual(error.actualChainId, mainnet.id);
    }),
  );

  it.effect("fails with USER_REJECTED when the user declines the switch", () =>
    Effect.gen(function* () {
      const { wallet } = browserWallet(
        Object.assign(new Error("User rejected the request."), { code: 4001 }),
      );
      const { ens } = clientWith({ wallet });

      yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(optimism.id) }), {
        _tag: "UserRejectedError",
        code: "USER_REJECTED",
      });
    }),
  );

  it.effect("asks a wallet getter for a wallet on the chain of the write", () =>
    Effect.gen(function* () {
      const asked: number[] = [];
      const { transport } = scriptedTransport(noRpc);
      const { ens } = clientWith({
        wallet: (chainId) => {
          asked.push(chainId);
          return createWalletClient({ chain: base, transport, account: signer });
        },
      });

      const error = yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(optimism.id) }), {
        _tag: "WalletError",
        code: "CHAIN_MISMATCH",
      });

      assert.deepStrictEqual(asked, [optimism.id]);
      assert.strictEqual(error.actualChainId, base.id);
    }),
  );

  it.effect("signs with a local account on any chain it reaches, without a wallet", () =>
    Effect.gen(function* () {
      const { ens, calls } = clientWith({ account: signer });

      const onOptimism = yield* chainClient(ens, optimism.id);
      const resolved = yield* resolveSigner(onOptimism, undefined);

      assert.strictEqual(resolved.account, signer);
      assert.strictEqual(resolved.walletClient.chain?.id, optimism.id);
      assert.lengthOf(calls, 0);
    }),
  );

  it.effect("checks the plan before the wallet", () =>
    Effect.gen(function* () {
      const { ens } = clientWith();

      yield* expectFailure(Actions.plan.send(ens, { plan: emptyPlan(sepolia.id) }), {
        _tag: "PlanError",
        code: "PLAN_CHAIN_MISMATCH",
      });
    }),
  );

  it.effect("prepares without a wallet", () =>
    Effect.gen(function* () {
      const { ens, calls } = clientWith();
      const plan = emptyPlan(1);

      const prepared = yield* Actions.plan.send.prepare(ens, { plan });

      assert.deepStrictEqual(prepared, plan);
      assert.lengthOf(calls, 0);
    }),
  );
});
