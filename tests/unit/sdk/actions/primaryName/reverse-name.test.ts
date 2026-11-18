import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { primaryNameCoinType, reverseName } from "@ensforge/sdk/internal/internal/reverse/coin";

describe("reverse names", () => {
  // ENSIP-19: the address in lowercase hex without `0x`, and the coin type in hex without leading
  // zeros; any other spelling is a different node.
  it.effect(
    "spell the address in lowercase hex and the coin type without leading zeros",
    () =>
      Effect.gen(function* () {
        const address = "0x225f137127d9067788314bc7fcc1f36746a3c3B5";
        const label = "225f137127d9067788314bc7fcc1f36746a3c3b5";

        for (const [coin, suffix] of [
          [undefined, "addr.reverse"],
          [{ chainId: 1 }, "addr.reverse"],
          ["default", "default.reverse"],
          [{ chainId: 10 }, "8000000a.reverse"],
          [{ chainId: 8453 }, "80002105.reverse"],
        ] as const) {
          const coinType = yield* primaryNameCoinType(coin);
          assert.strictEqual(reverseName(address, coinType), `${label}.${suffix}`);
        }
      }),
    { meta: { cases: ["H16", "H17"] } },
  );
});
