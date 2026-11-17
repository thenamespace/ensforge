import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Chain, Devnet } from "@ensforge/test-devnet";
import { erc20Abi } from "viem";

import { fundToken, onFork } from "../support/fork.ts";

describe("fork funding", () => {
  for (const network of ["mainnet", "sepolia"] as const) {
    onFork(network)(network, (it) => {
      it.effect("funds an account with each payment token", () =>
        Effect.gen(function* () {
          const { deployments, accounts } = yield* Devnet;
          const chain = yield* Chain;
          const tokens = deployments.v2?.paymentTokens;
          if (tokens === undefined) return assert.fail(`${network} lists no payment tokens`);

          for (const token of [tokens.usdc, tokens.dai]) {
            yield* fundToken(token, accounts.carol, 123_456_789n);
            const balance = yield* chain.read({
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [accounts.carol],
            });
            assert.strictEqual(balance, 123_456_789n, token);
          }
        }),
      );
    });
  }
});
