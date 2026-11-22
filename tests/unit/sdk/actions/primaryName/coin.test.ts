import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { CoinType } from "@ensforge/sdk";
import { primaryNameCoinType } from "@ensforge/sdk/internal/internal/reverse/coin";

// Primary names on the chain ENS runs on live under `addr.reverse` (coin 60), Sepolia included;
// the chain's own coin type there names an L2 path that does not exist.
describe("primaryNameCoinType", () => {
  it.effect("maps the ENS chain to Ethereum's coin on a testnet", () =>
    Effect.gen(function* () {
      const onSepolia = yield* primaryNameCoinType({ chainId: 11155111 }, 11155111);
      const fromMainnet = yield* primaryNameCoinType({ chainId: 11155111 }, 1);

      assert.strictEqual(onSepolia, 60n);
      assert.strictEqual(fromMainnet, CoinType.fromChainId(11155111));
    }),
  );
});
