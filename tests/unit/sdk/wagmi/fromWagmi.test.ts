import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Record as Rec, String as Str } from "effect";

import { addressOf } from "@ensforge/sdk/internal/internal/address";
import { chainClient } from "@ensforge/sdk/internal/internal/write/chain";
import { resolveSigner } from "@ensforge/sdk/internal/internal/write/signer";
import { fromWagmi } from "@ensforge/sdk/internal/wagmi/fromWagmi";
import { expectFailure, expectThrow } from "@ensforge/test-harness";
import { custom, numberToHex, type Chain } from "viem";
import { getBlockNumber } from "viem/actions";
import { base, mainnet, sepolia } from "viem/chains";
import { createConfig } from "wagmi";
import { connect, getConnectorClient, switchAccount } from "wagmi/actions";
import { mock } from "wagmi/connectors";

const alice = "0x00000000000000000000000000000000000a11ce";
const bob = "0x0000000000000000000000000000000000000b0b";

// wagmi and viem's actions are Promise APIs, so the tests call them with `Effect.promise`.

/** Every request the chains below receive. */
const requests: { chainId: number; method: string }[] = [];

/** Answers the chain ID and block number, records every request, and fails loudly on the rest. */
const chainTransport = (chain: Chain) =>
  custom({
    request: ({ method }: { method: string }) => {
      requests.push({ chainId: chain.id, method });
      if (method === "eth_chainId") return Promise.resolve(numberToHex(chain.id));
      if (method === "eth_blockNumber") return Promise.resolve("0x1");
      return Promise.reject(new Error(`Unscripted RPC request on ${chain.name}: ${method}`));
    },
  });

const wagmiConfig = (
  chains: readonly [Chain, ...Chain[]],
  features: Parameters<typeof mock>[0]["features"] = {},
) =>
  createConfig({
    chains,
    // Two wallets, so `switchAccount` can move between them.
    connectors: [mock({ accounts: [alice], features }), mock({ accounts: [bob], features })],
    transports: Rec.fromEntries(
      Arr.map(chains, (chain) => [chain.id.toString(), chainTransport(chain)]),
    ),
    storage: null,
  });

const wallet = (config: ReturnType<typeof wagmiConfig>, index: number) => {
  const connector = config.connectors[index];
  assert.isDefined(connector);
  return connector;
};

const connectOn = (config: ReturnType<typeof wagmiConfig>, chainId: number, index = 0) =>
  Effect.promise(() => connect(config, { connector: wallet(config, index), chainId }));

describe("fromWagmi chain selection", () => {
  it.effect.each([
    ["mainnet when configured", [base, sepolia, mainnet], {}, mainnet.id],
    ["the first chain with a deployment", [base, sepolia], {}, sepolia.id],
    ["an explicit chain", [mainnet, sepolia], { chainId: sepolia.id }, sepolia.id],
  ] as const)("picks %s and reads through its wagmi transport", ([, chains, options, expected]) =>
    Effect.gen(function* () {
      const ens = fromWagmi(wagmiConfig(chains), options);
      requests.length = 0;

      yield* Effect.promise(() => getBlockNumber(ens.client(), { cacheTime: 0 }));

      assert.strictEqual(ens.chain.id, expected);
      assert.deepStrictEqual(requests, [{ chainId: expected, method: "eth_blockNumber" }]);
    }),
  );

  it.each([
    ["no configured chain has a deployment", [base], {}],
    ["the chosen chain has no wagmi transport", [mainnet], { chainId: sepolia.id }],
  ] as const)("fails with UNKNOWN_CHAIN when %s", (_, chains, options) => {
    expectThrow(() => fromWagmi(wagmiConfig(chains), options), {
      _tag: "ConfigError",
      code: "UNKNOWN_CHAIN",
    });
  });
});

describe("fromWagmi wallet", () => {
  it.effect("fails with WALLET_NOT_CONFIGURED while no wallet is connected", () =>
    expectFailure(resolveSigner(fromWagmi(wagmiConfig([mainnet])), undefined), {
      _tag: "ConfigError",
      code: "WALLET_NOT_CONFIGURED",
    }),
  );

  it.effect("follows the connected account from one write to the next", () =>
    Effect.gen(function* () {
      const config = wagmiConfig([mainnet]);
      const ens = fromWagmi(config);
      yield* connectOn(config, mainnet.id);
      yield* connectOn(config, mainnet.id, 1);
      yield* Effect.promise(() => switchAccount(config, { connector: wallet(config, 0) }));

      const first = yield* resolveSigner(ens, undefined);
      yield* Effect.promise(() => switchAccount(config, { connector: wallet(config, 1) }));
      const second = yield* resolveSigner(ens, undefined);

      const lowercased = (account: typeof first.account) =>
        Option.map(Option.fromNullishOr(addressOf(account)), Str.toLowerCase);

      assert.deepStrictEqual(lowercased(first.account), Option.some(alice));
      assert.deepStrictEqual(lowercased(second.account), Option.some(bob));
    }),
  );

  it.effect("switches a wallet on another chain to the ENS chain", () =>
    Effect.gen(function* () {
      const config = wagmiConfig([mainnet, sepolia]);
      yield* connectOn(config, sepolia.id);

      const { walletClient } = yield* resolveSigner(fromWagmi(config), undefined);
      const connected = yield* Effect.promise(() => getConnectorClient(config));

      assert.strictEqual(walletClient.chain?.id, mainnet.id);
      assert.strictEqual(connected.chain.id, mainnet.id);
    }),
  );

  it.effect("keeps the wallet's chain and fails with CHAIN_MISMATCH when switching is off", () =>
    Effect.gen(function* () {
      const config = wagmiConfig([mainnet, sepolia]);
      yield* connectOn(config, sepolia.id);

      yield* expectFailure(resolveSigner(fromWagmi(config, { switchChain: false }), undefined), {
        _tag: "WalletError",
        code: "CHAIN_MISMATCH",
      });
      const connected = yield* Effect.promise(() => getConnectorClient(config));

      assert.strictEqual(connected.chain.id, sepolia.id);
    }),
  );

  it.effect("reports a rejected chain switch as UserRejectedError", () =>
    Effect.gen(function* () {
      // Sepolia first: the mock starts there, since it cannot switch.
      const config = wagmiConfig([sepolia, mainnet], { switchChainError: true });
      yield* connectOn(config, sepolia.id);

      yield* expectFailure(resolveSigner(fromWagmi(config), undefined), {
        _tag: "UserRejectedError",
      });
    }),
  );
});

describe("fromWagmi chains", () => {
  it.effect("adds every other configured chain, read and signed on through wagmi", () =>
    Effect.gen(function* () {
      const config = wagmiConfig([mainnet, base]);
      const ens = fromWagmi(config);
      yield* connectOn(config, mainnet.id);

      const onBase = yield* chainClient(ens, base.id);
      requests.length = 0;
      yield* Effect.promise(() => getBlockNumber(onBase.client(), { cacheTime: 0 }));
      const { walletClient } = yield* resolveSigner(onBase, undefined);

      assert.strictEqual(onBase.chain.id, base.id);
      assert.deepStrictEqual(requests, [{ chainId: base.id, method: "eth_blockNumber" }]);
      assert.strictEqual(walletClient.chain?.id, base.id);
    }),
  );

  // Names can live on chains the app did not add to wagmi: ensforge reads them on public RPCs.
  it.effect("reaches a chain wagmi does not have through its public RPC, unless turned off", () =>
    Effect.gen(function* () {
      const onBase = yield* chainClient(fromWagmi(wagmiConfig([mainnet])), base.id);

      assert.strictEqual(onBase.client().transport.url, base.rpcUrls.default.http[0]);
      yield* expectFailure(
        chainClient(fromWagmi(wagmiConfig([mainnet]), { publicRpc: false }), base.id),
        { _tag: "ConfigError", code: "CHAIN_NOT_CONFIGURED" },
      );
    }),
  );

  it.effect("fails before the wallet prompt to sign on a chain wagmi does not have", () =>
    Effect.gen(function* () {
      const config = wagmiConfig([mainnet]);
      const onBase = yield* chainClient(fromWagmi(config), base.id);
      yield* connectOn(config, mainnet.id);

      const error = yield* expectFailure(resolveSigner(onBase, undefined), {
        _tag: "ConfigError",
        code: "CHAIN_NOT_CONFIGURED",
      });
      const connected = yield* Effect.promise(() => getConnectorClient(config));

      assert.strictEqual(error.context.chainId, base.id);
      assert.strictEqual(connected.chain.id, mainnet.id);
    }),
  );
});
