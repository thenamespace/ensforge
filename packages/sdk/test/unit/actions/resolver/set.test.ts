import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk";
import { expectRejection } from "@ensforge/test-harness";
import { getAddress, zeroAddress } from "viem";
import { namehash } from "viem/ens";

import {
  clientFor,
  decodeCalls,
  now,
  other,
  resolverA,
  signer,
  v1,
  v2Registry,
  type World,
} from "../world.js";

const name = "alice.eth";
const node = namehash(name);
const resolver = getAddress(resolverA);
const abis = [...Abis.v1.ensRegistry, ...Abis.v1.nameWrapper, ...Abis.v2.permissionedRegistry];

describe("resolver.set.prepare", () => {
  // Where the call goes depends on where the name lives.
  it.each([
    ["ENSv1 unwrapped → registry", { name, v1: { owner: signer } }, v1.registry, [node, resolver]],
    [
      "ENSv1 wrapped → NameWrapper",
      { name, v1: { owner: signer, wrapper: { owner: signer, fuses: 0, expiry: now + 1000n } } },
      v1.nameWrapper,
      [node, resolver],
    ],
    [
      "ENSv2 → parent registry, by token ID",
      { name, v2: { owner: signer, tokenId: 42n } },
      getAddress(v2Registry),
      [42n, resolver],
    ],
  ] as const)("routes %s", async (_, world: World, to, args) => {
    const { ens } = clientFor(world);

    const plan = await Actions.resolver.set.prepare(ens, { name, resolver: resolverA });

    assert.strictEqual(plan.operation, "resolver.set");
    assert.strictEqual(plan.account, signer);
    assert.deepStrictEqual(
      plan.steps.map((step) => step.description),
      ["Set resolver"],
    );
    assert.deepStrictEqual(decodeCalls(plan.calls, abis), [[to, "setResolver", args]]);
  });

  it.each([
    ["`null` clears the resolver", null, "Remove resolver", zeroAddress],
    ['"default" picks the ENSv1 public resolver', "default", "Set resolver", v1.publicResolver],
  ] as const)("%s", async (_, option, description, expected) => {
    const { ens } = clientFor({ name, v1: { owner: signer, resolver: resolverA } });

    const plan = await Actions.resolver.set.prepare(ens, { name, resolver: option });

    assert.deepStrictEqual(
      plan.steps.map((step) => step.description),
      [description],
    );
    assert.deepStrictEqual(decodeCalls(plan.calls, abis), [
      [v1.registry, "setResolver", [node, expected]],
    ]);
  });

  it.effect.each([
    [
      "an unregistered name",
      { name },
      resolverA,
      { _tag: "NameStateError", code: "NAME_NOT_REGISTERED" },
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
    expectRejection(
      () => Actions.resolver.set.prepare(clientFor(world).ens, { name, resolver: option }),
      expected,
    ).pipe(Effect.asVoid),
  );
});
