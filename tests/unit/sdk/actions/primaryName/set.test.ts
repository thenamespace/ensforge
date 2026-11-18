import { assert, describe, it } from "@effect/vitest";
import { Effect, pipe, String as Str } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { decodeFunctionData, namehash, zeroAddress, type Address } from "viem";

import { clientFor, decodeCalls, other, resolverA, signer } from "../world.js";

// `verify: false` skips the forward-resolution check, which goes through the Universal Resolver.
/** `primaryName.set.prepare` naming `other`, a contract with this Ownable owner and namers. */
const prepareForContract = (
  contract: { readonly owner: Address; readonly namers: readonly Address[] },
  v1Only = false,
) =>
  Actions.primaryName.set.prepare(
    clientFor({ name: "alice.eth", v1Only, contracts: { [other]: contract } }).ens,
    { name: "alice.eth", address: other, verify: false },
  );

describe("primaryName.set.prepare", () => {
  it.effect.each([
    ["the signer's own name", { name: "Alice.eth" }, "Set primary name", "setName", ["alice.eth"]],
    ["a clear", { name: null }, "Clear primary name", "setName", [""]],
    [
      "the name of an account the signer operates, through the registrar's default resolver",
      { name: "alice.eth", address: other },
      "Set primary name",
      "setNameForAddr",
      [other, other, resolverA, "alice.eth"],
    ],
  ] as const)(
    "writes %s on the reverse registrar",
    ([, options, description, functionName, args]) =>
      Effect.gen(function* () {
        const { ens } = clientFor({ name: "alice.eth", approvedForAll: true });

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

  // `other` is a contract here: the v1 registrar names it for its Ownable owner, the ENSv2 adapter
  // lets its ContractNamer claim its reverse node and then set the name there.
  it.effect("routes a contract's name by what the signer is to it", () =>
    Effect.gen(function* () {
      const v1 = Deployments.mainnet.v1.contracts;
      const abi = [
        ...Abis.v1.reverseRegistrar,
        ...Abis.v2.reverseRegistrarAdapter,
        ...Abis.v1.publicResolver,
      ];

      const owned = yield* prepareForContract({ owner: signer, namers: [] });
      assert.deepStrictEqual(decodeCalls(owned.calls, abi), [
        [v1.reverseRegistrar, "setNameForAddr", [other, other, resolverA, "alice.eth"]],
      ]);

      const named = yield* prepareForContract({ owner: zeroAddress, namers: [signer] });
      assert.strictEqual(named.steps.length, 1);
      assert.deepStrictEqual(decodeCalls(named.calls, abi), [
        [Deployments.mainnet.v2.contracts.reverseRegistrarAdapter, "claim", [other, resolverA]],
        [
          resolverA,
          "setName",
          [namehash(`${pipe(other, Str.slice(2), Str.toLowerCase)}.addr.reverse`), "alice.eth"],
        ],
      ]);

      yield* expectFailure(prepareForContract({ owner: zeroAddress, namers: [] }), {
        _tag: "UnauthorizedError",
        code: "NOT_APPROVED",
      });
      yield* expectFailure(prepareForContract({ owner: zeroAddress, namers: [signer] }, true), {
        _tag: "UnsupportedError",
        code: "UNSUPPORTED_ON_DEPLOYMENT",
      });
    }),
  );

  it.effect("refuses an account the signer may not name before sending", () =>
    expectFailure(
      Actions.primaryName.set.prepare(clientFor({ name: "alice.eth" }).ens, {
        name: "alice.eth",
        address: other,
        verify: false,
      }),
      { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
    ),
  );
});
