import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { decodeFunctionData, getAddress, maxUint64, type Abi } from "viem";
import { labelhash, namehash } from "viem/ens";

import { clientFor, now, other, resolverA, signer, v1, type Entry, type World } from "../world.js";

const child = "pay.alice.eth";
const subregistry = "0x00000000000000000000000000000000000000c5";
const owner = getAddress(other);
const resolver = getAddress(resolverA);

const parentV1: Entry = { v1: { owner: signer } };
const parentWrapped: Entry = {
  v1: { owner: signer, wrapper: { owner: signer, fuses: 0, expiry: now + 1000n } },
};
const parentV2: Entry = { v2: { owner: signer, subregistry } };

const under = (parent: Entry, world: Partial<World> = {}): World => ({
  name: child,
  names: { "alice.eth": parent },
  ...world,
});

describe("subname.create.prepare", () => {
  it.effect.each([
    [
      "ENSv1 parent → registry setSubnodeRecord",
      parentV1,
      v1.registry,
      Abis.v1.ensRegistry,
      [namehash("alice.eth"), labelhash("pay"), owner, resolver, 0n],
    ],
    [
      "wrapped parent → NameWrapper setSubnodeRecord with fuses and expiry",
      parentWrapped,
      v1.nameWrapper,
      Abis.v1.nameWrapper,
      [namehash("alice.eth"), "pay", owner, resolver, 0n, 0, 0n],
    ],
    [
      "ENSv2 parent → register in its subregistry with the registration roles",
      parentV2,
      subregistry,
      Abis.v2.userRegistry,
      [
        "pay",
        owner,
        "0x0000000000000000000000000000000000000000",
        resolver,
        Roles.registryBitmaps.registration,
        maxUint64,
      ],
    ],
  ] as const)("routes an %s", ([, parent, to, abi, args]) =>
    Effect.gen(function* () {
      const { ens } = clientFor(under(parent));

      const plan = yield* Actions.subname.create.prepare(ens, { name: child, owner, resolver });

      assert.deepStrictEqual(
        plan.steps.map((step) => [step.id, step.description]),
        [["create", "Create subname"]],
      );
      assert.deepStrictEqual(plan.deploys, []);
      const [call] = plan.calls;
      assert.strictEqual(call?.to.toLowerCase(), to.toLowerCase());
      const decoded = decodeFunctionData({ abi: abi as Abi, data: call?.data ?? "0x" });
      assert.strictEqual(
        decoded.functionName,
        abi === Abis.v2.userRegistry ? "register" : "setSubnodeRecord",
      );
      assert.deepStrictEqual(decoded.args, args);
    }),
  );

  it.effect("writes records in a second step once the child exists", () =>
    Effect.gen(function* () {
      const { ens } = clientFor(under(parentV1));

      const plan = yield* Actions.subname.create.prepare(ens, {
        name: child,
        resolver,
        records: { texts: { url: "x" } },
      });

      assert.deepStrictEqual(
        plan.steps.map((step) => step.id),
        ["create", "records"],
      );
      const records = plan.steps[1]?.calls[0] ?? { to: "0x", data: "0x" };
      assert.strictEqual(records.to, resolver);
      assert.deepStrictEqual(
        decodeFunctionData({ abi: Abis.v1.publicResolver, data: records.data }).args,
        [namehash(child), "url", "x"],
      );
    }),
  );

  it.effect("updates an existing child with `upsert`", () =>
    Effect.gen(function* () {
      const { ens } = clientFor(under(parentV1, { v1: { owner: other } }));

      const plan = yield* Actions.subname.create.prepare(ens, {
        name: child,
        resolver,
        upsert: true,
      });

      assert.strictEqual(plan.steps[0]?.description, "Update subname");
    }),
  );

  it.effect.each([
    [
      "the child exists",
      under(parentV1, { v1: { owner: other } }),
      {},
      "NameStateError",
      "NAME_NOT_AVAILABLE",
    ],
    ["the parent is unregistered", { name: child }, {}, "NameStateError", "NAME_NOT_REGISTERED"],
    ["the name is a 2LD", { name: "alice.eth" }, {}, "InvalidInputError", "INVALID_NAME"],
    [
      "roles go to an ENSv1 parent",
      under(parentV1),
      { roles: ["setResolver"] },
      "UnsupportedError",
      "UNSUPPORTED_PROTOCOL",
    ],
    [
      "fuses go to an unwrapped parent",
      under(parentV2),
      { fuses: ["cannotUnwrap"] },
      "UnsupportedError",
      "UNSUPPORTED_PROTOCOL",
    ],
    [
      "records have no resolver",
      under(parentV1),
      { resolver: null, records: { texts: { url: "x" } } },
      "InvalidInputError",
      "INVALID_RECORD_VALUE",
    ],
  ] as const)("fails before signing when %s", ([, world, options, tag, code]) =>
    expectFailure(
      Actions.subname.create.prepare(clientFor(world).ens, {
        name: world.name,
        resolver,
        ...options,
      }),
      { _tag: tag, code },
    ),
  );
});
