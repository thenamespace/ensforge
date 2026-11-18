import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { primaryNameCoinType, reverseName } from "@ensforge/sdk/internal/internal/reverse/coin";
import { expectFailure } from "@ensforge/test-harness";
import { zeroAddress } from "viem";

import { clientFor, other } from "../world.js";

describe("primaryName.get", () => {
  // Reverse names are keyed by EVM addresses: the default reverse resolver answers other coins
  // with `UnreachableName`, and the Universal Resolver finds no resolver for coin 0.
  it.effect(
    "refuses coins that are not EVM chains before reading anything",
    () =>
      Effect.gen(function* () {
        const { ens, calls } = clientFor({ name: "alice.eth" });

        for (const [address, coin] of [
          [other, "btc"],
          [zeroAddress, 0n],
          [other, 2n ** 32n],
        ] as const) {
          yield* expectFailure(Actions.primaryName.get(ens, { address, coin }), {
            _tag: "InvalidInputError",
            code: "INVALID_COIN_TYPE",
          });
        }
        assert.deepStrictEqual(calls, []);
      }),
    { meta: { cases: ["P06", "P29", "K11"] } },
  );

  // ENSIP-19: Ethereum and its testnets read `addr.reverse` (coin 60); an L2 testnet reads its own
  // chain's namespace, Base Sepolia's `80014a34.reverse`.
  it.effect(
    "reads each chain's reverse namespace",
    () =>
      Effect.gen(function* () {
        const label = other.slice(2).toLowerCase();

        assert.strictEqual(
          reverseName(other, yield* primaryNameCoinType(undefined)),
          `${label}.addr.reverse`,
        );
        assert.strictEqual(
          reverseName(other, yield* primaryNameCoinType({ chainId: 84_532 })),
          `${label}.80014a34.reverse`,
        );
        assert.strictEqual(
          reverseName(other, yield* primaryNameCoinType("default")),
          `${label}.default.reverse`,
        );
      }),
    { meta: { cases: ["P28"] } },
  );
});
