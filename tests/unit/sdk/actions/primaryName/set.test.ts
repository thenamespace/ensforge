import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { decodeFunctionData } from "viem";

import { clientFor, other, resolverA } from "../world.js";

// `verify: false` skips the forward-resolution check, which goes through the Universal Resolver.
describe("primaryName.set.prepare", () => {
  it.effect.each([
    ["the signer's own name", { name: "Alice.eth" }, "Set primary name", "setName", ["alice.eth"]],
    ["a clear", { name: null }, "Clear primary name", "setName", [""]],
    [
      "another account's name, through the registrar's default resolver",
      { name: "alice.eth", address: other },
      "Set primary name",
      "setNameForAddr",
      [other, other, resolverA, "alice.eth"],
    ],
  ] as const)(
    "writes %s on the reverse registrar",
    ([, options, description, functionName, args]) =>
      Effect.gen(function* () {
        const { ens } = clientFor({ name: "alice.eth" });

        const plan = yield* Actions.primaryName.set.prepare(ens, { ...options, verify: false });

        const decoded = decodeFunctionData({
          abi: Abis.v1.reverseRegistrar,
          data: plan.calls[0]?.data ?? "0x",
        });
        assert.strictEqual(plan.steps[0]?.description, description);
        assert.strictEqual(plan.calls[0]?.to, Deployments.mainnet.v1.contracts.reverseRegistrar);
        assert.strictEqual(decoded.functionName, functionName);
        assert.deepStrictEqual(decoded.args, args);
      }),
  );

  it.effect("checks the target address before reading anything", () =>
    Effect.gen(function* () {
      const { ens, calls } = clientFor({ name: "alice.eth" });

      yield* expectFailure(
        Actions.primaryName.set.prepare(ens, { name: "alice.eth", address: "0x12" }),
        { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
      );

      assert.deepStrictEqual(calls, []);
    }),
  );
});
