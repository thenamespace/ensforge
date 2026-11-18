import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Ensforge } from "@ensforge/sdk";
import { chainClient, hasChain } from "@ensforge/sdk/internal/internal/write/chain";
import { resolveSigner } from "@ensforge/sdk/internal/internal/write/signer";
import { expectFailure, noRpc, scriptedTransport } from "@ensforge/test-harness";
import { createPublicClient, createWalletClient, getAddress } from "viem";
import { mainnet, optimism } from "viem/chains";

const alice = getAddress("0x00000000000000000000000000000000000a11ce");
const bob = getAddress("0x0000000000000000000000000000000000000b0b");
const { transport } = scriptedTransport(noRpc);

/** A mainnet client with an Optimism public client, named by viem's chain or not. */
const clientWith = (optimismChain: typeof optimism | undefined) =>
  Ensforge.create({
    publicClient: createPublicClient({ chain: mainnet, transport }),
    walletClient: createWalletClient({ chain: mainnet, transport, account: alice }),
    account: alice,
    chains: { 10: { publicClient: createPublicClient({ chain: optimismChain, transport }) } },
  });

describe("chain clients", () => {
  it.effect("builds one client per configured chain, named after its chain", () =>
    Effect.gen(function* () {
      const named = clientWith(optimism);
      const unnamed = clientWith(undefined);

      const first = yield* chainClient(named, 10);
      const second = yield* chainClient(named, 10);

      assert.strictEqual(first, second);
      assert.deepStrictEqual(first.chain, { id: 10, name: "OP Mainnet" });
      assert.strictEqual(first.account, alice);
      assert.strictEqual(yield* chainClient(named, 1), named);
      assert.deepStrictEqual((yield* chainClient(unnamed, 10)).chain, { id: 10, name: "chain 10" });
    }),
  );

  // A copy of a client carries none of its internal state: only its own chain is known.
  it.effect("knows only its own chain without the client's state", () =>
    Effect.gen(function* () {
      const copy = { ...clientWith(optimism) };

      const error = yield* expectFailure(chainClient(copy, 10), {
        _tag: "ConfigError",
        code: "CHAIN_NOT_CONFIGURED",
      });

      assert.strictEqual(error.context.chainId, 10);
      assert.isFalse(hasChain(copy, 10));
      assert.isTrue(hasChain(copy, 1));
      assert.isTrue(hasChain(clientWith(optimism), 10));
    }),
  );
});

describe("write signers", () => {
  it.effect("signs as the account the write names before the client's", () =>
    Effect.gen(function* () {
      const client = clientWith(optimism);

      assert.strictEqual((yield* resolveSigner(client, bob)).account, bob);
      assert.strictEqual((yield* resolveSigner(client, undefined)).account, alice);
    }),
  );

  it.effect("has no wallet without the client's state", () =>
    expectFailure(resolveSigner({ ...clientWith(optimism) }, undefined), {
      _tag: "ConfigError",
      code: "WALLET_NOT_CONFIGURED",
    }),
  );
});
