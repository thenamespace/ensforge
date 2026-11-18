import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { defineExecutor } from "@ensforge/hca/internal/executors/define";
import { owner as ownerExecutor } from "@ensforge/hca/internal/executors/owner";
import { hca } from "@ensforge/hca/internal/hca";
import type { ExecutionRequest, Executor, HcaSession } from "@ensforge/hca/internal/types";
import type { Plan, Write } from "@ensforge/sdk";
import { makePlan } from "@ensforge/sdk/extension";
import { expectRejection } from "@ensforge/test-harness";
import { encodeFunctionData, getAddress, zeroAddress, zeroHash, type Address } from "viem";

import { hcaAddress, makeClient, owner, v1 } from "../fixtures";

// Checksummed, as calls come back decoded from an execution.
const target = getAddress("0x00000000000000000000000000000000000000aa");
const stranger: Address = "0x00000000000000000000000000000000000000bb";
const call: Plan.Call = { to: target, data: "0x12345678", value: 0n };
const fees: readonly Plan.Fee[] = [
  { kind: "execution", token: "native", amount: 1n, maximum: 2n, sponsored: false },
];

/** An executor that records what it is asked to send and quote, answering `ref-<n>`. */
const recording = (extra: Partial<Executor> = {}) => {
  const sent: ExecutionRequest[] = [];
  const quoted: ExecutionRequest[] = [];
  const executor = defineExecutor({
    id: "relayer",
    capabilities: { sessions: true, sponsorship: true, deploys: true },
    send: async (request) => {
      sent.push(request);
      return `ref-${sent.length}`;
    },
    quote: async (request) => {
      quoted.push(request);
      return fees;
    },
    ...extra,
  });
  return { executor, sent, quoted };
};

const planOf = (steps: readonly Plan.Step[], warnings: readonly Plan.Warning[] = []) =>
  makePlan({ operation: "records.set", chainId: 11155111, account: owner, steps, warnings });

const prepared = (via: Write.Via, plan: Plan, context = makeClient({ deployed: true }).context) =>
  Effect.promise(() => (via.prepare as NonNullable<Write.Via["prepare"]>)(plan, context));

const session: HcaSession = {
  chainId: 11155111,
  hca: hcaAddress,
  owner,
  sessionKey: stranger,
  terms: {
    sessionNonce: 0n,
    validUntil: 4_000_000_000,
    resolver: stranger,
    refundToken: zeroAddress,
    maxRefundExchangeRate: 1n,
    maxRefundGasOverhead: 1n,
    maxRefundAmount: 1n,
  },
  permissionId: zeroHash,
  sessionDigest: zeroHash,
  chains: [],
  ownerSignature: "0x",
  signingDomain: "smart-session",
};

// Routes are Promise interfaces the write runtime calls, so these tests await them.
describe("hca route: prepared plans", () => {
  it.effect("keeps the plan's warnings, a step's wait, and names the setup step", () =>
    Effect.gen(function* () {
      const plan = planOf(
        [
          { id: "a", description: "a", calls: [call], waitFor: { seconds: 60n } },
          { id: "signer", description: "signer", calls: [call], from: "signer" },
          { id: "b", description: "b", calls: [call] },
        ],
        [{ code: "EARLIER", message: "an earlier warning" }],
      );

      const routed = yield* prepared(hca(), plan, makeClient({ deployed: false }).context);

      assert.deepStrictEqual(routed.warnings, plan.warnings);
      assert.strictEqual(routed.steps[0]?.description, "Set up your HCA");
      assert.deepStrictEqual(routed.steps[1]?.waitFor, { seconds: 60n });
      assert.deepStrictEqual(
        routed.steps.map((step) => [step.id, "waitFor" in step]),
        [
          ["hca-setup", false],
          ["a", true],
          ["signer", false],
          ["b", false],
        ],
      );
      assert.notProperty(routed, "fees");
    }),
  );

  it.effect("prepares on a deployment without ENSv1", () =>
    Effect.gen(function* () {
      const { context } = makeClient({
        deployed: true,
        deployment: { ...Deployments.sepolia, v1: undefined } as never,
      });

      const routed = yield* prepared(
        hca(),
        planOf([{ id: "a", description: "a", calls: [call] }]),
        context,
      );

      assert.deepStrictEqual(
        routed.steps.map((step) => step.id),
        ["a"],
      );
    }),
  );

  it.effect("asks the executor for the fees of the HCA's executions", () =>
    Effect.gen(function* () {
      const { executor, quoted } = recording();
      const plan = planOf([
        { id: "a", description: "a", calls: [call] },
        {
          id: "approve",
          description: "approve",
          calls: [{ ...call, to: stranger }],
          from: "signer",
        },
      ]);

      const routed = yield* prepared(hca({ executors: [executor] }), plan);

      assert.deepStrictEqual(routed.fees, fees);
      assert.deepStrictEqual(quoted, [
        {
          chainId: 11155111,
          hca: hcaAddress,
          owner,
          deployed: true,
          calls: [call],
          session: undefined,
          description: "records.set",
        },
      ]);
    }),
  );
});

describe("hca route: wrapped names", () => {
  it.effect("warns that the HCA becomes a NameWrapper operator", () =>
    Effect.gen(function* () {
      const transfer: Plan.Call = {
        to: v1.nameWrapper,
        data: encodeFunctionData({
          abi: Abis.v1.nameWrapper,
          functionName: "safeTransferFrom",
          args: [owner, stranger, 1n, 1n, "0x"],
        }),
        value: 0n,
      };

      const routed = yield* prepared(
        hca(),
        planOf([{ id: "a", description: "a", calls: [transfer] }]),
      );

      assert.deepStrictEqual(routed.warnings, [
        {
          code: "HCA_WRAPPER_APPROVAL",
          message:
            "Your HCA becomes a NameWrapper operator for your wrapped names; revoke it with approval.setOperator once done.",
        },
      ]);
    }),
  );
});

describe("hca route: sending", () => {
  it.effect("sends each execution through the executor as the HCA's calls", () =>
    Effect.gen(function* () {
      const { executor, sent } = recording();
      const via = hca({ executors: [executor] });
      const { context } = makeClient({ deployed: true });
      const routed = yield* prepared(
        via,
        planOf([{ id: "a", description: "Set records", calls: [call] }]),
      );

      const reference = yield* Effect.promise(() =>
        (via.send as NonNullable<Write.Via["send"]>)(routed.steps[0] as Plan.Step, context),
      );

      assert.strictEqual(reference, "ref-1");
      assert.deepStrictEqual(sent, [
        {
          chainId: 11155111,
          hca: hcaAddress,
          owner,
          deployed: true,
          calls: [call],
          session: undefined,
          description: "Set records",
        },
      ]);
      assert.strictEqual(
        yield* Effect.promise(() => (via.sender as NonNullable<Write.Via["sender"]>)(context)),
        hcaAddress,
      );
    }),
  );

  it.effect.each<readonly [string, Plan.Step]>([
    ["a plain call", { id: "a", description: "Set records", calls: [call] }],
    ["no call", { id: "a", description: "Set records", calls: [] }],
  ])("refuses to send a step with %s", ([, step]) =>
    Effect.gen(function* () {
      const via = hca({ executors: [recording().executor] });

      const error = yield* expectRejection(
        () => (via.send as NonNullable<Write.Via["send"]>)(step, makeClient().context),
        { _tag: "HcaError", code: "HCA_EXECUTION_FAILED" },
      );

      assert.strictEqual(
        (error as { readonly shortMessage?: string }).shortMessage,
        '"Set records" is not an HCA execution.',
      );
    }),
  );

  it.effect("reports the executor's status, or pending when it has none", () =>
    Effect.gen(function* () {
      const { context } = makeClient();
      const silent = hca({ executors: [recording().executor] });
      const reporting = hca({
        executors: [
          recording({ status: async () => ({ status: "success", hashes: [zeroHash] }) }).executor,
        ],
      });
      const status = (via: Write.Via) =>
        Effect.promise(() => (via.status as NonNullable<Write.Via["status"]>)("ref-1", context));

      assert.deepStrictEqual(yield* status(silent), { status: "pending" });
      assert.deepStrictEqual(yield* status(reporting), { status: "success", hashes: [zeroHash] });
    }),
  );

  // The owner's wallet sends the executions as ordinary transactions.
  it("leaves sending to the wallet with the owner executor", () => {
    const via = hca({ executors: [ownerExecutor()] });

    assert.strictEqual(via.send, undefined);
    assert.strictEqual(via.status, undefined);
    assert.deepStrictEqual(ownerExecutor().capabilities, {
      sessions: false,
      sponsorship: false,
      deploys: false,
    });
  });

  it.effect("names the missing signer", () =>
    Effect.gen(function* () {
      const error = yield* expectRejection(
        () =>
          (hca().sender as NonNullable<Write.Via["sender"]>)({
            ...makeClient().context,
            account: undefined,
          }),
        { _tag: "HcaError", code: "HCA_NOT_VERIFIED" },
      );

      assert.strictEqual(
        (error as { readonly shortMessage?: string }).shortMessage,
        "An HCA write needs a signer: the HCA's owner.",
      );
    }),
  );
});

describe("hca route: sessions", () => {
  it.effect.each<readonly [string, HcaSession, string]>([
    ["of another owner", { ...session, owner: stranger }, "another owner"],
    ["that expired", { ...session, terms: { ...session.terms, validUntil: 1 } }, "expired"],
  ])("refuses a session %s", ([, invalid, detail]) =>
    Effect.gen(function* () {
      const via = hca({ executors: [recording().executor], session: invalid });

      const error = yield* expectRejection(
        () =>
          (via.prepare as NonNullable<Write.Via["prepare"]>)(
            planOf([{ id: "a", description: "a", calls: [call] }]),
            makeClient({ deployed: true }).context,
          ),
        { _tag: "HcaError", code: "HCA_SESSION_INVALID" },
      );

      assert.deepStrictEqual((error as { readonly details?: unknown }).details, [detail]);
    }),
  );

  // The signer's own steps are not run by the session, so its policy does not apply to them.
  it.effect("checks the session's policy on the HCA's steps only", () =>
    Effect.gen(function* () {
      const via = hca({ executors: [recording().executor], session });
      const signerStep: Plan.Step = {
        id: "approve",
        description: "approve",
        calls: [call],
        from: "signer",
      };

      const routed = yield* prepared(via, planOf([signerStep]));
      yield* expectRejection(
        () =>
          (via.prepare as NonNullable<Write.Via["prepare"]>)(
            planOf([{ id: "a", description: "a", calls: [call] }]),
            makeClient({ deployed: true }).context,
          ),
        { _tag: "HcaError", code: "HCA_ACTION_NOT_ALLOWED" },
      );

      assert.deepStrictEqual(routed.steps, [signerStep]);
    }),
  );
});
