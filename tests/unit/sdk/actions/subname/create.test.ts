import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Abis, Deployments, Roles } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { getAddress, maxUint64, zeroAddress } from "viem";
import { labelhash, namehash } from "viem/ens";

import {
  clientFor,
  decodeCalls,
  now,
  other,
  resolverA,
  signer,
  type Entry,
  type World,
} from "../world.js";

const child = "pay.alice.eth";
const subregistry = getAddress("0x00000000000000000000000000000000000000c5");
const { registry, nameWrapper } = Deployments.mainnet.v1.contracts;

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
      registry,
      "setSubnodeRecord",
      [namehash("alice.eth"), labelhash("pay"), other, resolverA, 0n],
    ],
    [
      "wrapped parent → NameWrapper setSubnodeRecord with fuses and expiry",
      parentWrapped,
      nameWrapper,
      "setSubnodeRecord",
      [namehash("alice.eth"), "pay", other, resolverA, 0n, 0, 0n],
    ],
    [
      "ENSv2 parent → register in its subregistry with the registration roles",
      parentV2,
      subregistry,
      "register",
      ["pay", other, zeroAddress, resolverA, Roles.registryBitmaps.registration, maxUint64],
    ],
  ] as const)("routes an %s", ([, parent, to, functionName, args]) =>
    Effect.gen(function* () {
      const { ens } = clientFor(under(parent));

      const plan = yield* Actions.subname.create.prepare(ens, {
        name: child,
        owner: other,
        resolver: resolverA,
      });

      assert.deepStrictEqual(
        Arr.map(plan.steps, (step) => [step.id, step.description]),
        [["create", "Create subname"]],
      );
      assert.deepStrictEqual(plan.deploys, []);
      assert.deepStrictEqual(
        decodeCalls(plan.calls, [
          ...Abis.v1.ensRegistry,
          ...Abis.v1.nameWrapper,
          ...Abis.v2.userRegistry,
        ]),
        [[to, functionName, args]],
      );
    }),
  );

  it.effect("writes records in a second step once the child exists", () =>
    Effect.gen(function* () {
      const { ens } = clientFor(under(parentV1));

      const plan = yield* Actions.subname.create.prepare(ens, {
        name: child,
        resolver: resolverA,
        records: { texts: { url: "x" } },
      });

      assert.deepStrictEqual(
        Arr.map(plan.steps, (step) => step.id),
        ["create", "records"],
      );
      assert.deepStrictEqual(decodeCalls(plan.steps[1]?.calls ?? [], Abis.v1.publicResolver), [
        [resolverA, "setText", [namehash(child), "url", "x"]],
      ]);
    }),
  );

  it.effect("updates an existing child with `upsert`", () =>
    Effect.gen(function* () {
      const { ens } = clientFor(under(parentV1, { v1: { owner: other } }));

      const plan = yield* Actions.subname.create.prepare(ens, {
        name: child,
        resolver: resolverA,
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
        resolver: resolverA,
        ...options,
      }),
      { _tag: tag, code },
    ),
  );
});
