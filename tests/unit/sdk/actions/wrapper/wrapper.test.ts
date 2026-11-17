import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { decodeAbiParameters, decodeFunctionData, getAddress, type Hex } from "viem";
import { labelhash, namehash } from "viem/ens";

import { clientFor, dnsEncode, now, other, signer, v1, type World } from "../world.js";

// NameWrapper fuse bits (ens-contracts INameWrapper.sol), the oracle for fuse masks.
const CANNOT_UNWRAP = 1;
const CANNOT_BURN_FUSES = 2;
const CANNOT_SET_RESOLVER = 8;
const PARENT_CANNOT_CONTROL = 1 << 16;

const wrapped = (name: string, fuses: number): World => ({
  name,
  v1: { owner: signer, wrapper: { owner: signer, fuses, expiry: now + 1000n } },
});

const decode = (data: Hex) => decodeFunctionData({ abi: Abis.v1.nameWrapper, data });

describe("wrapper.wrap.prepare", () => {
  it.effect(
    "wraps a .eth 2LD by sending the registrar token to the NameWrapper with its data",
    () =>
      Effect.gen(function* () {
        const { ens } = clientFor({ name: "alice.eth", v1: { owner: signer } });

        const plan = yield* Actions.wrapper.wrap.prepare(ens, {
          name: "alice.eth",
          fuses: ["cannotUnwrap"],
        });

        assert.deepStrictEqual(
          plan.steps.map((step) => step.id),
          ["wrap"],
        );
        const [call] = plan.calls;
        assert.strictEqual(call?.to, v1.baseRegistrar);
        const { functionName, args } = decodeFunctionData({
          abi: Abis.v1.baseRegistrar,
          data: call?.data ?? "0x",
        });
        assert.strictEqual(functionName, "safeTransferFrom");
        assert.deepStrictEqual(args?.slice(0, 3), [
          getAddress(signer),
          v1.nameWrapper,
          BigInt(labelhash("alice")),
        ]);
        const [label, owner, fuses] = decodeAbiParameters(
          [{ type: "string" }, { type: "address" }, { type: "uint16" }, { type: "address" }],
          args?.[3] as Hex,
        );
        assert.deepStrictEqual([label, owner, fuses], ["alice", getAddress(signer), CANNOT_UNWRAP]);
      }),
  );

  it.effect.each([
    ["approves the NameWrapper first when the manager has not", false, ["approve", "wrap"]],
    ["skips the approval when the NameWrapper is already approved", true, ["wrap"]],
  ] as const)("%s", ([, approved, steps]) =>
    Effect.gen(function* () {
      const name = "pay.alice.eth";
      const { ens } = clientFor({
        name,
        v1: { owner: signer },
        approvedForAll: approved,
      });

      const plan = yield* Actions.wrapper.wrap.prepare(ens, { name });

      assert.deepStrictEqual(
        plan.steps.map((step) => step.id),
        [...steps],
      );
      const wrap = plan.calls.at(-1);
      assert.strictEqual(wrap?.to, v1.nameWrapper);
      assert.deepStrictEqual(decode(wrap?.data ?? "0x").args?.slice(0, 2), [
        dnsEncode(name),
        getAddress(signer),
      ]);
    }),
  );

  it.effect.each([
    ["an already wrapped name", wrapped("alice.eth", 0), {}, "NameStateError", "NAME_WRAPPED"],
    [
      "an ENSv2 name",
      { name: "alice.eth", v2: { owner: signer } },
      {},
      "UnsupportedError",
      "UNSUPPORTED_PROTOCOL",
    ],
    [
      "fuses on a subname",
      { name: "pay.alice.eth", v1: { owner: signer } },
      { fuses: ["cannotUnwrap"] },
      "InvalidInputError",
      "INVALID_RECORD_VALUE",
    ],
    [
      "fuses without cannotUnwrap",
      { name: "alice.eth", v1: { owner: signer } },
      { fuses: ["cannotSetResolver"] },
      "InvalidInputError",
      "INVALID_RECORD_VALUE",
    ],
  ] as const)("refuses %s", ([, world, options, tag, code]) =>
    Effect.gen(function* () {
      const { ens } = clientFor(world);
      yield* expectFailure(Actions.wrapper.wrap.prepare(ens, { name: world.name, ...options }), {
        _tag: tag,
        code,
      });
    }),
  );
});

describe("wrapper.setFuses.prepare", () => {
  it.effect("burns the requested owner fuses on the node", () =>
    Effect.gen(function* () {
      const { ens } = clientFor(wrapped("alice.eth", PARENT_CANNOT_CONTROL));

      const plan = yield* Actions.wrapper.setFuses.prepare(ens, {
        name: "alice.eth",
        fuses: ["cannotUnwrap", "cannotSetResolver"],
      });

      assert.strictEqual(plan.calls[0]?.to, v1.nameWrapper);
      const { functionName, args } = decode(plan.calls[0]?.data ?? "0x");
      assert.strictEqual(functionName, "setFuses");
      assert.deepStrictEqual(args, [namehash("alice.eth"), CANNOT_UNWRAP | CANNOT_SET_RESOLVER]);
    }),
  );

  it.effect.each([
    [
      "cannotBurnFuses is burned",
      wrapped("alice.eth", PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_BURN_FUSES),
      "UnauthorizedError",
      "FUSE_BURNED",
    ],
    [
      "the name is not wrapped",
      { name: "alice.eth", v1: { owner: signer } },
      "NameStateError",
      "NAME_NOT_WRAPPED",
    ],
    [
      "the parent has not burned parentCannotControl",
      wrapped("alice.eth", 0),
      "InvalidInputError",
      "INVALID_RECORD_VALUE",
    ],
  ] as const)("fails before signing when %s", ([, world, tag, code]) =>
    expectFailure(
      Actions.wrapper.setFuses.prepare(clientFor(world).ens, {
        name: "alice.eth",
        fuses: ["cannotUnwrap"],
      }),
      { _tag: tag, code },
    ),
  );
});

describe("wrapper.unwrap.prepare", () => {
  it.effect.each([
    [
      "a .eth 2LD with unwrapETH2LD",
      "alice.eth",
      "unwrapETH2LD",
      [labelhash("alice"), signer, signer],
    ],
    [
      "a subname under its parent node",
      "pay.alice.eth",
      "unwrap",
      [namehash("alice.eth"), labelhash("pay"), signer],
    ],
  ] as const)("unwraps %s", ([, name, functionName, args]) =>
    Effect.gen(function* () {
      const { ens } = clientFor(wrapped(name, 0));

      const plan = yield* Actions.wrapper.unwrap.prepare(ens, { name });

      const decoded = decode(plan.calls[0]?.data ?? "0x");
      assert.strictEqual(decoded.functionName, functionName);
      assert.deepStrictEqual<readonly unknown[] | undefined>(
        decoded.args,
        args.map((arg) => (arg === signer ? getAddress(signer) : arg)),
      );
    }),
  );

  it.effect("refuses once cannotUnwrap is burned", () =>
    expectFailure(
      Actions.wrapper.unwrap.prepare(
        clientFor(wrapped("alice.eth", PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)).ens,
        { name: "alice.eth", owner: other },
      ),
      { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
    ),
  );
});
