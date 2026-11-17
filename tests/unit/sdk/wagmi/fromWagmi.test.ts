import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { addressOf, resolveSigner } from "@ensforge/sdk/internal/internal/write/signer";
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
    request: async ({ method }: { method: string }) => {
      requests.push({ chainId: chain.id, method });
      if (method === "eth_chainId") return numberToHex(chain.id);
      if (method === "eth_blockNumber") return "0x1";
      throw new Error(`Unscripted RPC request on ${chain.name}: ${method}`);
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
    transports: Object.fromEntries(chains.map((chain) => [chain.id, chainTransport(chain)])),
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

      yield* Effect.promise(() => getBlockNumber(ens.publicClient, { cacheTime: 0 }));

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

      assert.strictEqual(addressOf(first.account)?.toLowerCase(), alice);
      assert.strictEqual(addressOf(second.account)?.toLowerCase(), bob);
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
