import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { zeroAddress } from "viem";
import { namehash } from "viem/ens";

import { clientFor, decodeCalls, now, other, resolverA, signer, v2Registry } from "../world.js";

const name = "alice.eth";
const node = namehash(name);
const v1 = Deployments.mainnet.v1.contracts;
const abis = [...Abis.v1.ensRegistry, ...Abis.v1.nameWrapper, ...Abis.v2.permissionedRegistry];

describe("resolver.set.prepare", () => {
  // Where the call goes depends on where the name lives.
  it.effect.each([
    ["ENSv1 unwrapped → registry", { name, v1: { owner: signer } }, v1.registry, [node, resolverA]],
    [
      "ENSv1 wrapped → NameWrapper",
      { name, v1: { owner: signer, wrapper: { owner: signer, fuses: 0, expiry: now + 1000n } } },
      v1.nameWrapper,
      [node, resolverA],
    ],
    [
      "ENSv2 → parent registry, by token ID",
      { name, v2: { owner: signer, tokenId: 42n } },
      v2Registry,
      [42n, resolverA],
    ],
  ] as const)("routes %s", ([, world, to, args]) =>
    Effect.gen(function* () {
      const { ens } = clientFor(world);

      const plan = yield* Actions.resolver.set.prepare(ens, { name, resolver: resolverA });

      assert.strictEqual(plan.operation, "resolver.set");
      assert.strictEqual(plan.account, signer);
      assert.deepStrictEqual(
        Arr.map(plan.steps, (step) => step.description),
        ["Set resolver"],
      );
      assert.deepStrictEqual(decodeCalls(plan.calls, abis), [[to, "setResolver", args]]);
    }),
  );

  it.effect.each([
    ["`null` clears the resolver", null, "Remove resolver", zeroAddress],
    ['"default" picks the ENSv1 public resolver', "default", "Set resolver", v1.publicResolver],
  ] as const)("%s", ([, option, description, expected]) =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name, v1: { owner: signer, resolver: resolverA } });

      const plan = yield* Actions.resolver.set.prepare(ens, { name, resolver: option });

      assert.deepStrictEqual(
        Arr.map(plan.steps, (step) => step.description),
        [description],
      );
      assert.deepStrictEqual(decodeCalls(plan.calls, abis), [
        [v1.registry, "setResolver", [node, expected]],
      ]);
    }),
  );

  it.effect.each([
    [
      "an unregistered name",
      { name },
      resolverA,
      { _tag: "NameStateError", code: "NAME_NOT_REGISTERED" },
    ],
    [
      "a name its parent's off-chain resolver serves",
      {
        name,
        found: { resolver: resolverA, offset: 6n },
        extended: [resolverA],
        served: { [resolverA]: "offchain" },
      },
      resolverA,
      { _tag: "NameStateError", code: "NAME_EXTERNAL" },
    ],
    [
      "an expired name",
      { name, v1: { owner: other, expiry: now - 1n } },
      resolverA,
      { _tag: "NameStateError", code: "NAME_EXPIRED" },
    ],
    [
      "a reserved ENSv2 name",
      { name, v2: { owner: zeroAddress, status: 1 } },
      resolverA,
      { _tag: "NameStateError", code: "NAME_RESERVED" },
    ],
    [
      '"default" on an ENSv2 name',
      { name, v2: { owner: signer } },
      "default",
      { _tag: "UnsupportedError", code: "UNSUPPORTED_PROTOCOL" },
    ],
    [
      "a malformed resolver",
      { name, v1: { owner: signer } },
      "0x1234",
      { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
    ],
  ] as const)("refuses %s", ([, world, option, expected]) =>
    expectFailure(
      Actions.resolver.set.prepare(clientFor(world).ens, { name, resolver: option }),
      expected,
    ),
  );

  // Writes to an address without code succeed and do nothing; one deployed later may be named.
  it.effect("refuses a resolver address without a contract, unless allowed", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name, v1: { owner: signer } });

      yield* expectFailure(Actions.resolver.set.prepare(ens, { name, resolver: other }), {
        _tag: "NotFoundError",
        code: "RESOLVER_NOT_DEPLOYED",
      });
      const plan = yield* Actions.resolver.set.prepare(ens, {
        name,
        resolver: other,
        allowNonContract: true,
      });
      assert.deepStrictEqual(decodeCalls(plan.calls, abis), [
        [v1.registry, "setResolver", [node, other]],
      ]);
    }),
  );
});
