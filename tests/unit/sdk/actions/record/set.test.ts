import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions, Name } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { decodeFunctionData, getAddress, zeroAddress } from "viem";
import { namehash } from "viem/ens";

import { clientFor, decodeCalls, resolverA, signer, v2Registry } from "../world.js";

const name = "alice.eth";
const node = namehash(name);

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
      const [multicall] = plan.calls;
      const [setters = []] = decodeFunctionData({
        abi: Abis.shared.multicallResolver,
        data: multicall?.data ?? "0x",
      }).args;
      assert.strictEqual(getAddress(multicall?.to ?? "0x"), resolverA);
      assert.deepStrictEqual(
        setters.map((data) => decodeFunctionData({ abi: Abis.v1.publicResolver, data })),
        [
          { functionName: "clearRecords", args: [node] },
          { functionName: "setText", args: [node, "url", "https://alice.dev"] },
          { functionName: "setText", args: [node, "avatar", ""] },
          // ENSv1 resolvers revert on empty coin-60 bytes, so deleting writes the zero address.
          { functionName: "setAddr", args: [node, 60n, zeroAddress] },
        ],
      );
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

      const dns = Name.dnsEncode(name);
      const [setters = []] = decodeFunctionData({
        abi: Abis.shared.multicallResolver,
        data: plan.calls[0]?.data ?? "0x",
      }).args;
      assert.deepStrictEqual(
        setters.map((data) => decodeFunctionData({ abi: Abis.v2.permissionedResolver, data })),
        [
          { functionName: "linkToRecord", args: [dns, 0n] },
          { functionName: "setText", args: [dns, "url", "https://alice.dev"] },
          { functionName: "setAddress", args: [dns, 60n, "0x"] },
        ],
      );
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
          [resolverA, "setText", [node, "url", "x"]],
          [v2Registry, "setResolver", [7n, resolverA]],
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
      { name, v1: { owner: signer, resolver: Deployments.mainnet.v1.frozenPublicResolvers[0] } },
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

  // PublicResolver reverts `InvalidEVMAddress` and both resolvers refuse ABI content types that
  // are not one power of two; ensforge refuses them first, as it does a mistyped checksum.
  it.effect(
    "refuses addresses and ABI content types a resolver would reject",
    () =>
      Effect.gen(function* () {
        const { ens } = clientFor({ name, v1: { owner: signer, resolver: resolverA } });

        for (const address of ["0x1234", "0x00000000000000000000000000000000000a11CE"]) {
          yield* expectFailure(
            Actions.record.set.prepare(ens, { name, addresses: { eth: address } }),
            { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
          );
        }
        // The types rule content type 3 out; untyped callers reach the check.
        yield* expectFailure(
          Actions.record.set.prepare(ens, { name, abi: { contentType: 3n as 1n, value: "0x" } }),
          { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
        );
      }),
    { meta: { cases: ["K06", "K07", "K24"] } },
  );
});
