import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { nameWrapperFuses as fuses } from "@ensforge/contracts/v1";
import { Actions, Name } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { decodeAbiParameters, decodeFunctionData, isHex, parseAbiParameters } from "viem";
import { labelhash, namehash } from "viem/ens";

import { clientFor, now, other, signer, type World } from "../world.js";

const { baseRegistrar, nameWrapper } = Deployments.mainnet.v1.contracts;

const wrapped = (name: string, burned: number): World => ({
  name,
  v1: { owner: signer, wrapper: { owner: signer, fuses: burned, expiry: now + 1000n } },
});

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

        const [call] = plan.calls;
        const { functionName, args } = decodeFunctionData({
          abi: Abis.v1.baseRegistrar,
          data: call?.data ?? "0x",
        });
        assert.deepStrictEqual(
          Arr.map(plan.steps, (step) => step.id),
          ["wrap"],
        );
        assert.strictEqual(call?.to, baseRegistrar);
        assert.strictEqual(functionName, "safeTransferFrom");
        assert.deepStrictEqual(args?.slice(0, 3), [
          signer,
          nameWrapper,
          BigInt(labelhash("alice")),
        ]);
        const wrapData = args?.[3];
        if (!isHex(wrapData)) assert.fail("the transfer carries no wrap data");
        assert.deepStrictEqual(
          decodeAbiParameters(
            parseAbiParameters("string, address, uint16, address"),
            wrapData,
          ).slice(0, 3),
          ["alice", signer, fuses.cannotUnwrap],
        );
      }),
  );

  it.effect.each([
    ["approves the NameWrapper first when the manager has not", false, ["approve", "wrap"]],
    ["skips the approval when the NameWrapper is already approved", true, ["wrap"]],
  ] as const)("%s", ([, approved, steps]) =>
    Effect.gen(function* () {
      const name = "pay.alice.eth";
      const { ens } = clientFor({ name, v1: { owner: signer }, approvedForAll: approved });

      const plan = yield* Actions.wrapper.wrap.prepare(ens, { name });

      const wrap = plan.calls.at(-1);
      assert.deepStrictEqual(
        Arr.map(plan.steps, (step) => step.id),
        [...steps],
      );
      assert.strictEqual(wrap?.to, nameWrapper);
      assert.deepStrictEqual(
        decodeFunctionData({ abi: Abis.v1.nameWrapper, data: wrap?.data ?? "0x" }).args?.slice(
          0,
          2,
        ),
        [Name.dnsEncode(name), signer],
      );
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
    expectFailure(
      Actions.wrapper.wrap.prepare(clientFor(world).ens, { name: world.name, ...options }),
      { _tag: tag, code },
    ),
  );
});

describe("wrapper.setFuses.prepare", () => {
  it.effect("burns the requested owner fuses on the node", () =>
    Effect.gen(function* () {
      const { ens } = clientFor(wrapped("alice.eth", fuses.parentCannotControl));

      const plan = yield* Actions.wrapper.setFuses.prepare(ens, {
        name: "alice.eth",
        fuses: ["cannotUnwrap", "cannotSetResolver"],
      });

      assert.strictEqual(plan.calls[0]?.to, nameWrapper);
      assert.deepStrictEqual(
        decodeFunctionData({ abi: Abis.v1.nameWrapper, data: plan.calls[0]?.data ?? "0x" }),
        {
          functionName: "setFuses",
          args: [namehash("alice.eth"), fuses.cannotUnwrap | fuses.cannotSetResolver],
        },
      );
    }),
  );

  it.effect.each([
    [
      "cannotBurnFuses is burned",
      wrapped("alice.eth", fuses.parentCannotControl | fuses.cannotUnwrap | fuses.cannotBurnFuses),
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

      assert.deepStrictEqual(
        decodeFunctionData({ abi: Abis.v1.nameWrapper, data: plan.calls[0]?.data ?? "0x" }),
        { functionName, args },
      );
    }),
  );

  // An approved operator unwrapping for the holder must not take the name.
  it.effect("leaves the name with its holder by default", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({
        name: "alice.eth",
        v1: { owner: other, wrapper: { owner: other, fuses: 0, expiry: now + 1000n } },
        approvedForAll: true,
      });

      const plan = yield* Actions.wrapper.unwrap.prepare(ens, { name: "alice.eth" });

      assert.deepStrictEqual(
        decodeFunctionData({ abi: Abis.v1.nameWrapper, data: plan.calls[0]?.data ?? "0x" }).args,
        [labelhash("alice"), other, other],
      );
    }),
  );

  it.effect("refuses once cannotUnwrap is burned", () =>
    expectFailure(
      Actions.wrapper.unwrap.prepare(
        clientFor(wrapped("alice.eth", fuses.parentCannotControl | fuses.cannotUnwrap)).ens,
        { name: "alice.eth", owner: other },
      ),
      { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
    ),
  );
});
