import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import { defineExecutor } from "@ensforge/hca/internal/executors/define";
import { owner as ownerExecutor } from "@ensforge/hca/internal/executors/owner";
import { hca } from "@ensforge/hca/internal/hca";
import type { Executor } from "@ensforge/hca/internal/types";
import type { Plan } from "@ensforge/sdk";
import { makePlan } from "@ensforge/sdk/extension";
import { expectRejection, expectThrow } from "@ensforge/test-harness";
import { decodeFunctionData, encodeFunctionData, type Address, type Hex } from "viem";

import { contracts, hcaAddress, makeClient, owner, v1 } from "../fixtures";

const target: Address = "0x00000000000000000000000000000000000000aa";
const other: Address = "0x00000000000000000000000000000000000000bb";

const call = (value = 0n, data: Hex = "0x12345678"): Plan.Call => ({ to: target, data, value });
const step = (
  id: string,
  calls: readonly Plan.Call[],
  extra: Partial<Plan.Step> = {},
): Plan.Step => ({
  id,
  description: id,
  calls,
  ...extra,
});
const planOf = (steps: readonly Plan.Step[]) =>
  makePlan({ operation: "test", chainId: 11155111, account: owner, steps });

const relayer = (capabilities: Partial<Executor["capabilities"]> = {}): Executor =>
  defineExecutor({
    id: "relayer",
    capabilities: { sessions: false, sponsorship: true, deploys: true, ...capabilities },
    send: async () => "1",
  });

const prepare = (
  steps: readonly Plan.Step[],
  options: { deployed?: boolean; executor?: Executor } = {},
) => {
  const { context } = makeClient({ deployed: options.deployed ?? true });
  const via = hca(options.executor === undefined ? {} : { executors: [options.executor] });
  return Effect.promise(() =>
    (via.prepare as NonNullable<typeof via.prepare>)(planOf(steps), context),
  );
};

const defined = <value>(value: value | undefined): value => {
  assert.isDefined(value);
  return value as value;
};

/** The calls an `executeByOwner` call runs, decoded with the HCA ABI. */
const executions = (executeByOwner: Plan.Call | undefined) => {
  const outer = defined(executeByOwner);
  assert.strictEqual(outer.to, hcaAddress);
  const decoded = decodeFunctionData({ abi: standaloneSingleOwnerHcaV2Abi, data: outer.data });
  assert.strictEqual(decoded.functionName, "executeByOwner");
  return (
    decoded.args as readonly [readonly { target: Address; value: bigint; callData: Hex }[]]
  )[0];
};

const approve = (id: bigint) => ({
  to: v1.baseRegistrar,
  data: encodeFunctionData({
    abi: Abis.v1.baseRegistrar,
    functionName: "approve",
    args: [hcaAddress, id],
  }),
  value: 0n,
});

describe("hca route: setup step", () => {
  it.effect("deploys an undeployed HCA first when the executor cannot", () =>
    Effect.gen(function* () {
      const plan = yield* prepare([step("a", [call()])], { deployed: false });

      assert.deepStrictEqual(
        plan.steps.map((s) => [s.id, s.from]),
        [
          ["hca-setup", "signer"],
          ["a", undefined],
        ],
      );
      const deploy = defined(defined(plan.steps[0]).calls[0]);
      assert.strictEqual(deploy.to, contracts.standaloneFactory);
      assert.deepStrictEqual(
        decodeFunctionData({ abi: standaloneHcaFactoryV2Abi, data: deploy.data }).args,
        [owner, contracts.standaloneImplementation, 0n],
      );
      assert.deepStrictEqual(
        plan.calls,
        plan.steps.flatMap((s) => s.calls),
      );
    }),
  );

  it.effect.each([
    ["deployed, owner executor", true, undefined],
    ["undeployed, executor that deploys", false, relayer()],
  ] as const)("adds no setup step when %s", ([, deployed, executor]) =>
    Effect.gen(function* () {
      const plan = yield* prepare([step("a", [call()])], {
        deployed,
        ...(executor ? { executor } : {}),
      });
      assert.deepStrictEqual(
        plan.steps.map((s) => s.id),
        ["a"],
      );
    }),
  );

  const baseRegistrar = (
    functionName: "safeTransferFrom" | "transferFrom",
    from: Address,
    id: bigint,
  ) => ({
    to: v1.baseRegistrar,
    data: encodeFunctionData({
      abi: Abis.v1.baseRegistrar,
      functionName,
      args: [from, other, id],
    } as never),
    value: 0n,
  });
  const nameWrapper = (batch: boolean, from: Address) => ({
    to: v1.nameWrapper,
    data: batch
      ? encodeFunctionData({
          abi: Abis.v1.nameWrapper,
          functionName: "safeBatchTransferFrom",
          args: [from, other, [1n], [1n], "0x"],
        })
      : encodeFunctionData({
          abi: Abis.v1.nameWrapper,
          functionName: "safeTransferFrom",
          args: [from, other, 1n, 1n, "0x"],
        }),
    value: 0n,
  });
  const operator = {
    to: v1.nameWrapper,
    data: encodeFunctionData({
      abi: Abis.v1.nameWrapper,
      functionName: "setApprovalForAll",
      args: [hcaAddress, true],
    }),
    value: 0n,
  };

  it.effect.each([
    [
      "registrar tokens, one approve per id",
      [baseRegistrar("safeTransferFrom", owner, 1n), baseRegistrar("transferFrom", owner, 2n)],
      [approve(1n), approve(2n)],
      false,
    ],
    ["registrar tokens of someone else", [baseRegistrar("safeTransferFrom", other, 1n)], [], false],
    [
      "wrapped names, one operator approval",
      [nameWrapper(false, owner), nameWrapper(true, owner)],
      [operator],
      true,
    ],
    ["wrapped names of someone else", [nameWrapper(true, other)], [], false],
    ["unrelated calls", [call()], [], false],
  ] as const)("approves %s", ([, calls, expected, warns]) =>
    Effect.gen(function* () {
      const plan = yield* prepare([step("move", calls)]);
      const setup = plan.steps.find((s) => s.id === "hca-setup");

      assert.deepStrictEqual(setup?.calls ?? [], expected);
      assert.strictEqual(
        plan.warnings.some((w) => w.code === "HCA_WRAPPER_APPROVAL"),
        warns,
      );
    }),
  );

  it.effect("ignores approvals for steps the signer sends itself", () =>
    Effect.gen(function* () {
      const plan = yield* prepare([
        step("own", [baseRegistrar("safeTransferFrom", owner, 1n)], { from: "signer" }),
      ]);
      assert.deepStrictEqual(
        plan.steps.map((s) => s.id),
        ["own"],
      );
    }),
  );
});

describe("hca route: executions", () => {
  it.effect("merges consecutive steps into one execution and keeps signer steps apart", () =>
    Effect.gen(function* () {
      const plan = yield* prepare([
        step("a", [call(1n)]),
        step("b", [call(2n), call(3n)]),
        step("approve", [call()], { from: "signer" }),
        step("c", [call()]),
        step("d", [call()], { waitFor: { seconds: 60n } }),
        step("e", [call()]),
      ]);

      assert.deepStrictEqual(
        plan.steps.map((s) => [s.id, s.calls.length, s.waitFor?.seconds]),
        [
          ["a+b", 1, undefined],
          ["approve", 1, undefined],
          ["c", 1, undefined],
          ["d+e", 1, 60n],
        ],
      );
      assert.strictEqual(defined(plan.steps[0]).description, "a, b");
      assert.deepStrictEqual(
        executions(defined(plan.steps[0]).calls[0]).map((e) => e.value),
        [1n, 2n, 3n],
      );
      assert.strictEqual(defined(defined(plan.steps[1]).calls[0]).to, target);
    }),
  );

  it.effect.each([
    [32, [32]],
    [33, [32, 1]],
    [65, [32, 32, 1]],
  ] as const)("splits %i one-call steps into executions of %j calls", ([count, sizes]) =>
    Effect.gen(function* () {
      const steps = Array.from({ length: count }, (_, index) => step(`s${index}`, [call()]));
      const plan = yield* prepare(steps);
      assert.deepStrictEqual(
        plan.steps.map((s) => executions(s.calls[0]).length),
        [...sizes],
      );
    }),
  );

  it.effect("never splits one step, even above the budget", () =>
    Effect.gen(function* () {
      const plan = yield* prepare([
        step(
          "big",
          Array.from({ length: 40 }, () => call()),
        ),
        step("next", [call()]),
      ]);
      assert.deepStrictEqual(
        plan.steps.map((s) => executions(s.calls[0]).length),
        [40, 1],
      );
    }),
  );

  // The owner's wallet pays the inner value; bundlers and intents spend the HCA's own balance.
  it.effect.each([
    ["owner", undefined, 6n],
    ["an executor that sends", relayer(), 0n],
  ] as const)("forwards value with %s", ([, executor, forwarded]) =>
    Effect.gen(function* () {
      const plan = yield* prepare([step("a", [call(1n), call(5n)])], executor ? { executor } : {});
      const outer = defined(defined(plan.steps.at(-1)).calls[0]);
      assert.strictEqual(outer.value, forwarded);
      assert.deepStrictEqual(
        executions(outer).map((e) => e.value),
        [1n, 5n],
      );
    }),
  );
});

describe("hca route: preconditions", () => {
  it("selects the first executor that can run sessions", () => {
    const session = { owner } as never;
    assert.strictEqual(
      hca({ executors: [relayer(), relayer({ sessions: true })] }).id,
      "hca:relayer",
    );
    assert.strictEqual(hca().id, "hca:owner");
    expectThrow(() => hca({ executors: [ownerExecutor(), relayer()], session }), {
      _tag: "HcaError",
      code: "HCA_EXECUTOR_UNSUPPORTED",
    });
  });

  it.effect("needs a signer", () =>
    Effect.gen(function* () {
      const { context } = makeClient();
      const via = hca();
      const unsigned = { ...context, account: undefined };
      yield* expectRejection(() => defined(via.prepare)(planOf([step("a", [call()])]), unsigned), {
        _tag: "HcaError",
        code: "HCA_NOT_VERIFIED",
      });
    }),
  );

  it.effect("refuses a deployed HCA that fails verification", () =>
    Effect.gen(function* () {
      const { context } = makeClient({
        deployed: true,
        stubs: [
          {
            address: hcaAddress,
            abi: standaloneSingleOwnerHcaV2Abi,
            functions: {
              ownerAndSessionNonce: () => [other, 0n],
              accountId: () => "something-else",
              getImplementation: () => contracts.standaloneImplementation,
            },
          },
        ],
      });
      const error = yield* expectRejection(
        () => defined(hca().prepare)(planOf([step("a", [call()])]), context),
        {
          _tag: "HcaError",
          code: "HCA_NOT_VERIFIED",
        },
      );
      assert.deepStrictEqual((error as { details?: unknown }).details, [
        "owner-mismatch",
        "unknown-account",
        "not-certified",
      ]);
    }),
  );
});
