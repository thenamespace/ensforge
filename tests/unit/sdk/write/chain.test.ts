import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Ensforge } from "@ensforge/sdk";
import { chainClient, hasChain } from "@ensforge/sdk/internal/internal/write/chain";
import { resolveSigner } from "@ensforge/sdk/internal/internal/write/signer";
import { expectFailure, noRpc, scriptedTransport } from "@ensforge/test-harness";
import { createWalletClient, getAddress } from "viem";
import { mainnet, optimism } from "viem/chains";

const alice = getAddress("0x00000000000000000000000000000000000a11ce");
const bob = getAddress("0x0000000000000000000000000000000000000b0b");
const { transport } = scriptedTransport(noRpc);

/** A mainnet client that reaches OP Mainnet (a chain ensforge knows) and chain 4663 (one it does not). */
const client = () =>
  Ensforge.create({
    chain: mainnet,
    transports: { [mainnet.id]: transport, [optimism.id]: transport, 4663: transport },
    publicRpc: false,
    wallet: createWalletClient({ chain: mainnet, transport, account: alice }),
    account: alice,
  });

describe("chain clients", () => {
  it.effect("builds one client per chain it reaches, named after its chain", () =>
    Effect.gen(function* () {
      const ens = client();

      const first = yield* chainClient(ens, 10);
      const second = yield* chainClient(ens, 10);
      const own = yield* chainClient(ens, 1);
      const unknown = yield* chainClient(ens, 4663);

      assert.strictEqual(first, second);
      assert.deepStrictEqual(first.chain, { id: 10, name: "OP Mainnet" });
      assert.strictEqual(first.account, alice);
      assert.strictEqual(first.client(), ens.client(10));
      assert.strictEqual(own, ens);
      assert.deepStrictEqual(unknown.chain, { id: 4663, name: "chain 4663" });
    }),
  );

  // A copy of a client carries none of its internal state: only its own chain is known.
  it.effect("knows only its own chain without the client's state", () =>
    Effect.gen(function* () {
      const copy = { ...client() };

      const error = yield* expectFailure(chainClient(copy, 10), {
        _tag: "ConfigError",
        code: "CHAIN_NOT_CONFIGURED",
      });

      assert.strictEqual(error.context.chainId, 10);
      assert.isFalse(hasChain(copy, 10));
      assert.isTrue(hasChain(copy, 1));
      assert.isTrue(hasChain(client(), 10));
      assert.isFalse(hasChain(client(), 8453));
    }),
  );
});

describe("write signers", () => {
  it.effect("signs as the account the write names before the client's", () =>
    Effect.gen(function* () {
      const ens = client();

      assert.strictEqual((yield* resolveSigner(ens, bob)).account, bob);
      assert.strictEqual((yield* resolveSigner(ens, undefined)).account, alice);
    }),
  );

  it.effect("has no wallet without the client's state", () =>
    expectFailure(resolveSigner({ ...client() }, undefined), {
      _tag: "ConfigError",
      code: "WALLET_NOT_CONFIGURED",
    }),
  );
});
