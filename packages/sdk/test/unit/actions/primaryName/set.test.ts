import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk";
import { expectRejection } from "@ensforge/test-harness";
import { decodeFunctionData, getAddress } from "viem";

import { clientFor, other, resolverA, v1 } from "../world.js";

// `verify: false` skips the forward-resolution check, which goes through the Universal Resolver.
describe("primaryName.set.prepare", () => {
  it.each([
    ["the signer's own name", { name: "Alice.eth" }, "Set primary name", "setName", ["alice.eth"]],
    ["a clear", { name: null }, "Clear primary name", "setName", [""]],
    [
      "another account's name, through the registrar's default resolver",
      { name: "alice.eth", address: other },
      "Set primary name",
      "setNameForAddr",
      [getAddress(other), getAddress(other), getAddress(resolverA), "alice.eth"],
    ],
  ] as const)("writes %s on the reverse registrar", async (_, options, description, fn, args) => {
    const { ens } = clientFor({ name: "alice.eth" });

    const plan = await Actions.primaryName.set.prepare(ens, { ...options, verify: false });

    assert.strictEqual(plan.steps[0]?.description, description);
    assert.strictEqual(plan.calls[0]?.to, v1.reverseRegistrar);
    const decoded = decodeFunctionData({
      abi: Abis.v1.reverseRegistrar,
      data: plan.calls[0]?.data ?? "0x",
    });
    assert.strictEqual(decoded.functionName, fn);
    assert.deepStrictEqual(decoded.args, args);
  });

  it("checks the target address before reading anything", () =>
    Effect.gen(function* () {
      const { ens, calls } = clientFor({ name: "alice.eth" });

      yield* expectRejection(
        () => Actions.primaryName.set.prepare(ens, { name: "alice.eth", address: "0x12" }),
        { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
      );
      assert.deepStrictEqual(calls, []);
    }).pipe(Effect.asVoid, Effect.runPromise));
});
