import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option } from "effect";

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
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";

import { contracts, defined, hcaAddress, makeClient, owner, v1 } from "../fixtures";

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
    send: () => Promise.resolve("1"),
  });

const prepare = (
  steps: readonly Plan.Step[],
  options: { deployed?: boolean; executor?: Executor } = {},
) => {
  const { context } = makeClient({ deployed: options.deployed ?? true });
  const { prepare: prepareRoute } = hca(
    options.executor === undefined ? {} : { executors: [options.executor] },
  );
  assert.isDefined(prepareRoute);
  // Routes are Promise interfaces the write runtime calls.
  return Effect.promise(() => prepareRoute(planOf(steps), context));
};

/** The calls an `executeByOwner` call runs, decoded with the HCA ABI. */
const executions = (executeByOwner: Plan.Call | undefined) => {
  assert.isDefined(executeByOwner);
  assert.strictEqual(executeByOwner.to, hcaAddress);
  const decoded = decodeFunctionData({
    abi: standaloneSingleOwnerHcaV2Abi,
    data: executeByOwner.data,
  });
  if (decoded.functionName !== "executeByOwner")
    return assert.fail(`expected executeByOwner, decoded ${decoded.functionName}`);
  return decoded.args[0];
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
        Arr.map(plan.steps, (s) => [s.id, s.from]),
        [
          ["hca-setup", "signer"],
          ["a", undefined],
        ],
      );
      const deploy = plan.steps[0]?.calls[0];
      assert.isDefined(deploy);
      assert.strictEqual(deploy.to, contracts.standaloneFactory);
      assert.deepStrictEqual(
        decodeFunctionData({ abi: standaloneHcaFactoryV2Abi, data: deploy.data }).args,
        [owner, contracts.standaloneImplementation, 0n],
      );
      assert.deepStrictEqual(
        plan.calls,
        Arr.flatMap(plan.steps, (s) => s.calls),
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
        ...(executor === undefined ? {} : { executor }),
      });
      assert.deepStrictEqual(
        Arr.map(plan.steps, (s) => s.id),
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
    data:
      functionName === "safeTransferFrom"
        ? encodeFunctionData({
            abi: Abis.v1.baseRegistrar,
            functionName: "safeTransferFrom",
            args: [from, other, id],
          })
        : encodeFunctionData({
            abi: Abis.v1.baseRegistrar,
            functionName: "transferFrom",
            args: [from, other, id],
          }),
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
      [
        {
          to: v1.nameWrapper,
          data: encodeFunctionData({
            abi: Abis.v1.nameWrapper,
            functionName: "setApprovalForAll",
            args: [hcaAddress, true],
          }),
          value: 0n,
        },
      ],
      true,
    ],
    ["wrapped names of someone else", [nameWrapper(true, other)], [], false],
    ["unrelated calls", [call()], [], false],
  ] as const)("approves %s", ([, calls, expected, warns]) =>
    Effect.gen(function* () {
      const plan = yield* prepare([step("move", calls)]);
      const setup = Arr.findFirst(plan.steps, (s) => s.id === "hca-setup");

      assert.deepStrictEqual(
        Option.getOrElse(
          Option.map(setup, (s) => s.calls),
          () => [],
        ),
        expected,
      );
      assert.strictEqual(
        Arr.some(plan.warnings, (w) => w.code === "HCA_WRAPPER_APPROVAL"),
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
        Arr.map(plan.steps, (s) => s.id),
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
        Arr.map(plan.steps, (s) => [s.id, s.calls.length, s.waitFor?.seconds]),
        [
          ["a+b", 1, undefined],
          ["approve", 1, undefined],
          ["c", 1, undefined],
          ["d+e", 1, 60n],
        ],
      );
      assert.strictEqual(plan.steps[0]?.description, "a, b");
      assert.deepStrictEqual(
        Arr.map(executions(plan.steps[0]?.calls[0]), (e) => e.value),
        [1n, 2n, 3n],
      );
      assert.strictEqual(plan.steps[1]?.calls[0]?.to, target);
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
        Arr.map(plan.steps, (s) => executions(s.calls[0]).length),
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
        Arr.map(plan.steps, (s) => executions(s.calls[0]).length),
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
      const plan = yield* prepare(
        [step("a", [call(1n), call(5n)])],
        executor === undefined ? {} : { executor },
      );
      const outer = plan.steps.at(-1)?.calls[0];
      assert.strictEqual(outer?.value, forwarded);
      assert.deepStrictEqual(
        Arr.map(executions(outer), (e) => e.value),
        [1n, 5n],
      );
    }),
  );
});

describe("hca route: preconditions", () => {
  it("selects the first executor that can run sessions", () => {
    // The route only checks that a session is present when it picks an executor.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a partial session is enough for the precondition under test
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
      const { prepare: prepareRoute } = hca();
      assert.isDefined(prepareRoute);

      yield* expectRejection(
        () => prepareRoute(planOf([step("a", [call()])]), { ...context, account: undefined }),
        { _tag: "HcaError", code: "HCA_NOT_VERIFIED" },
      );
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
      const { prepare: prepareRoute } = hca();
      assert.isDefined(prepareRoute);

      const error = yield* expectRejection(
        () => prepareRoute(planOf([step("a", [call()])]), context),
        { _tag: "HcaError", code: "HCA_NOT_VERIFIED" },
      );

      assert.deepStrictEqual(Reflect.get(error, "details"), [
        "owner-mismatch",
        "unknown-account",
        "not-certified",
      ]);
    }),
  );
});

// The HCA pays for what it runs, so `hca()` moves the shortfall from the owner's wallet.
describe("hca route: funding", () => {
  const token: Address = "0x00000000000000000000000000000000000000cc";
  const spend = makePlan({
    operation: "test",
    chainId: 11155111,
    account: owner,
    steps: [step("register", [call()])],
    requirements: [{ kind: "balance", amount: 100n, token, account: hcaAddress }],
  });
  const fee: Plan.Fee = {
    kind: "execution",
    token,
    amount: 100n,
    maximum: 1_000n,
    sponsored: false,
  };
  const quoting = defineExecutor({
    id: "relayer",
    capabilities: { sessions: true, sponsorship: true, deploys: true },
    send: () => Promise.resolve("1"),
    quote: () => Promise.resolve([fee]),
  });

  /** `hca()`'s plan for `spend`, with an HCA holding `held` of the token and a permit token. */
  const funded = (held: bigint, options: Parameters<typeof hca>[0] = {}) => {
    const { context, calls } = makeClient({
      deployed: true,
      wallet: true,
      stubs: [
        {
          address: token,
          abi: [...Abis.shared.erc20, ...Abis.shared.erc2612],
          functions: {
            balanceOf: ([holder]) => (holder === hcaAddress ? held : 1_000_000n),
            nonces: () => 3n,
            eip712Domain: () => ["0x0f", "USD Coin", "2", 11155111n, token, zeroHash, []],
          },
        },
      ],
    });
    const { prepare: prepareRoute } = hca(options);
    assert.isDefined(prepareRoute);
    const run = () => prepareRoute(spend, context);
    return { run, plan: Effect.promise(run), calls };
  };

  it.effect("adds an owner transfer of the shortfall when the owner's wallet sends", () =>
    Effect.gen(function* () {
      const plan = yield* funded(30n).plan;

      const [setup] = plan.steps;
      assert.deepInclude(setup, { id: "hca-setup", from: "signer" });
      assert.deepStrictEqual(setup?.calls, [
        {
          to: token,
          data: encodeFunctionData({
            abi: Abis.shared.erc20,
            functionName: "transfer",
            args: [hcaAddress, 70n],
          }),
          value: 0n,
        },
      ]);
      assert.deepInclude(plan.requirements, {
        kind: "balance",
        amount: 70n,
        token,
        account: owner,
      });
      assert.include(
        Arr.map(plan.warnings, (warning) => warning.code),
        "HCA_FUNDING",
      );
    }),
  );

  // Spend 100 + fee 100 with a 5% margin, less the 30 the HCA holds.
  it.effect("opens a relayed execution with the owner's permit and pull, fees included", () =>
    Effect.gen(function* () {
      const { plan: planned, calls } = funded(30n, { executors: [quoting] });
      const plan = yield* planned;

      assert.isFalse(Arr.some(plan.steps, (each) => each.id === "hca-setup"));
      const [permit, pull, action] = executions(plan.steps[0]?.calls[0]);
      assert.strictEqual(
        decodeFunctionData({ abi: Abis.shared.erc2612, data: defined(permit).callData }).args?.[2],
        175n,
      );
      assert.deepStrictEqual(
        decodeFunctionData({ abi: Abis.shared.erc20, data: defined(pull).callData }).args,
        [owner, hcaAddress, 175n],
      );
      assert.strictEqual(action?.target, getAddress(target));
      assert.isTrue(Arr.some(calls, ({ method }) => method === "eth_signTypedData_v4"));
    }),
  );

  it.effect("funds nothing when the HCA holds enough", () =>
    Effect.gen(function* () {
      const plan = yield* funded(1_000n, { executors: [quoting] }).plan;

      assert.lengthOf(executions(plan.steps[0]?.calls[0]), 1);
      assert.deepStrictEqual(plan.requirements, spend.requirements);
    }),
  );

  it.effect('fails typed with `funding: "none"` when the HCA is short', () =>
    expectRejection(funded(30n, { funding: "none" }).run, {
      _tag: "InsufficientFundsError",
      code: "INSUFFICIENT_TOKEN_BALANCE",
    }),
  );
});
