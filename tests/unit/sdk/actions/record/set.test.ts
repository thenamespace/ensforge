import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { decodeFunctionData, getAddress, zeroAddress, type Abi, type Hex } from "viem";
import { namehash } from "viem/ens";

import {
  clientFor,
  decodeCalls,
  deployment,
  dnsEncode,
  resolverA,
  signer,
  v2Registry,
} from "../world.js";

const name = "alice.eth";
const node = namehash(name);
const resolver = getAddress(resolverA);

/** The setters inside a resolver `multicall`. */
const setters = (data: Hex | undefined, abi: Abi) => {
  const [inner] = decodeFunctionData({ abi: Abis.shared.multicallResolver, data: data ?? "0x" })
    .args as readonly [readonly Hex[]];
  return inner.map((call) => {
    const { functionName, args } = decodeFunctionData({ abi, data: call });
    return [functionName, args];
  });
};

describe("record.set.prepare", () => {
  it.effect("keys ENSv1 setters by node, in one multicall on the name's own resolver", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name, v1: { owner: signer, resolver: resolverA } });

      const plan = yield* Actions.record.set.prepare(ens, {
        name,
        clear: true,
        texts: { url: "https://alice.dev", avatar: null },
        addresses: { eth: null },
      });

      assert.deepStrictEqual(
        plan.steps.map((step) => [step.description, step.calls.length]),
        [["Set records", 1]],
      );
      assert.deepStrictEqual(
        plan.calls.map((call) => getAddress(call.to)),
        [resolver],
      );
      assert.deepStrictEqual(setters(plan.calls[0]?.data, Abis.v1.publicResolver), [
        ["clearRecords", [node]],
        ["setText", [node, "url", "https://alice.dev"]],
        ["setText", [node, "avatar", ""]],
        // ENSv1 resolvers revert on empty coin-60 bytes, so deleting writes the zero address.
        ["setAddr", [node, 60n, zeroAddress]],
      ]);
    }),
  );

  it.effect("keys PermissionedResolver setters by DNS-encoded name and clears by relinking", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({
        name,
        v2: { owner: signer, resolver: resolverA },
        permissioned: [resolverA],
      });

      const plan = yield* Actions.record.set.prepare(ens, {
        name,
        clear: true,
        texts: { url: "https://alice.dev" },
        addresses: { eth: null },
      });

      const dns = dnsEncode(name);
      assert.deepStrictEqual(setters(plan.calls[0]?.data, Abis.v2.permissionedResolver), [
        ["linkToRecord", [dns, 0n]],
        ["setText", [dns, "url", "https://alice.dev"]],
        ["setAddress", [dns, 60n, "0x"]],
      ]);
    }),
  );

  it.effect("writes to a new resolver before pointing the name at it, in one step", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name, v2: { owner: signer, tokenId: 7n } });

      const plan = yield* Actions.record.set.prepare(ens, {
        name,
        resolver: resolverA,
        texts: { url: "x" },
      });

      assert.deepStrictEqual(
        plan.steps.map((step) => step.description),
        ["Set records and resolver"],
      );
      assert.deepStrictEqual(
        decodeCalls(plan.calls, [...Abis.v1.publicResolver, ...Abis.v2.permissionedRegistry]),
        [
          [resolver, "setText", [node, "url", "x"]],
          [getAddress(v2Registry), "setResolver", [7n, resolver]],
        ],
      );
    }),
  );

  it.effect.each([
    [
      "the name has no resolver",
      { name, v1: { owner: signer } },
      { texts: { url: "x" } },
      { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" },
    ],
    [
      "the resolver is bound to the registry replaced in 2020",
      { name, v1: { owner: signer, resolver: deployment.v1.frozenPublicResolvers[0] } },
      { texts: { url: "x" } },
      { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
    ],
    [
      "there is nothing to write",
      { name, v1: { owner: signer, resolver: resolverA } },
      {},
      { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
    ],
    [
      "a pubkey goes to a PermissionedResolver",
      { name, v2: { owner: signer, resolver: resolverA }, permissioned: [resolverA] },
      { pubkey: { x: `0x${"11".repeat(32)}`, y: `0x${"22".repeat(32)}` } },
      { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
    ],
  ] as const)("fails when %s", ([, world, records, expected]) =>
    expectFailure(Actions.record.set.prepare(clientFor(world).ens, { name, ...records }), expected),
  );
});
