import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { HcaError } from "@ensforge/hca";
import { defineExecutor } from "@ensforge/hca/internal/executors/define";
import { owner as ownerExecutor } from "@ensforge/hca/internal/executors/owner";
import { hca } from "@ensforge/hca/internal/hca";
import type { ExecutionRequest, Executor, HcaSession } from "@ensforge/hca/internal/types";
import type { Plan, Write } from "@ensforge/sdk";
import { makePlan } from "@ensforge/sdk/extension";
import { expectRejection } from "@ensforge/test-harness";
import { encodeFunctionData, getAddress, zeroAddress, zeroHash, type Address } from "viem";

import { defined, hcaAddress, makeClient, owner, v1 } from "../fixtures";

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
    send: (request) => {
      sent.push(request);
      return Promise.resolve(`ref-${sent.length}`);
    },
    quote: (request) => {
      quoted.push(request);
      return Promise.resolve(fees);
    },
    ...extra,
  });
  return { executor, sent, quoted };
};

const planOf = (steps: readonly Plan.Step[], warnings: readonly Plan.Warning[] = []) =>
  makePlan({ operation: "records.set", chainId: 11155111, account: owner, steps, warnings });

const prepared = (via: Write.Via, plan: Plan, context = makeClient({ deployed: true }).context) =>
  Effect.promise(() => defined(via.prepare)(plan, context));

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
        Arr.map(routed.steps, (step) => [step.id, "waitFor" in step]),
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
      const { v1: _, ...withoutV1 } = Deployments.sepolia;
      const { context } = makeClient({ deployed: true, deployment: withoutV1 });

      const routed = yield* prepared(
        hca(),
        planOf([{ id: "a", description: "a", calls: [call] }]),
        context,
      );

      assert.deepStrictEqual(
        Arr.map(routed.steps, (step) => step.id),
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
          description: "a",
        },
      ]);
    }),
  );

  // A registration's commit and reveal are two intents, each charged its own fee.
  it.effect("quotes each HCA execution on its own, deploying only in the first", () =>
    Effect.gen(function* () {
      const { executor, quoted } = recording();
      const plan = planOf([
        { id: "commit", description: "commit", calls: [call] },
        {
          id: "register",
          description: "register",
          calls: [{ ...call, to: stranger }],
          waitFor: { seconds: 60n },
        },
      ]);

      const routed = yield* prepared(
        hca({ executors: [executor] }),
        plan,
        makeClient({ deployed: false }).context,
      );

      assert.deepStrictEqual(routed.fees, [...fees, ...fees]);
      assert.deepStrictEqual(
        Arr.map(quoted, (request) => [request.description, request.deployed, request.calls]),
        [
          ["commit", false, [call]],
          ["register", true, [{ ...call, to: getAddress(stranger) }]],
        ],
      );
    }),
  );

  it.effect("quotes only the HCA's executions when a signer step has no calls", () =>
    Effect.gen(function* () {
      const { executor, quoted } = recording();
      const plan = planOf([
        { id: "a", description: "a", calls: [call] },
        { id: "empty", description: "empty", calls: [], from: "signer" },
      ]);

      yield* prepared(hca({ executors: [executor] }), plan);

      assert.deepStrictEqual(
        Arr.map(quoted, (request) => request.calls),
        [[call]],
      );
    }),
  );

  it.effect("passes an HcaError from the executor's quote through unchanged", () =>
    Effect.gen(function* () {
      const rejected = new HcaError({ code: "HCA_BUNDLER_REJECTED", executor: "relayer" });
      const { executor } = recording({ quote: () => Promise.reject(rejected) });
      const plan = planOf([{ id: "a", description: "a", calls: [call] }]);

      const error = yield* expectRejection(
        () =>
          defined(hca({ executors: [executor] }).prepare)(
            plan,
            makeClient({ deployed: true }).context,
          ),
        { _tag: "HcaError", code: "HCA_BUNDLER_REJECTED" },
      );

      assert.strictEqual(error, rejected);
    }),
  );

  it.effect("reports another failure of the executor's quote as a failed execution", () =>
    Effect.gen(function* () {
      const failure = new Error("quote service down");
      const { executor } = recording({ quote: () => Promise.reject(failure) });
      const plan = planOf([{ id: "a", description: "a", calls: [call] }]);

      const error = yield* expectRejection(
        () =>
          defined(hca({ executors: [executor] }).prepare)(
            plan,
            makeClient({ deployed: true }).context,
          ),
        { _tag: "HcaError", code: "HCA_EXECUTION_FAILED" },
      );

      assert.strictEqual(Reflect.get(error, "cause"), failure);
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

      const [routedStep] = routed.steps;
      assert.isDefined(routedStep);
      const reference = yield* Effect.promise(() => defined(via.send)(routedStep, context));
      const sender = yield* Effect.promise(() => defined(via.sender)(context));

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
      assert.strictEqual(sender, hcaAddress);
    }),
  );

  it.effect.each<readonly [string, Plan.Step]>([
    ["a plain call", { id: "a", description: "Set records", calls: [call] }],
    ["no call", { id: "a", description: "Set records", calls: [] }],
  ])("refuses to send a step with %s", ([, step]) =>
    Effect.gen(function* () {
      const via = hca({ executors: [recording().executor] });

      const error = yield* expectRejection(() => defined(via.send)(step, makeClient().context), {
        _tag: "HcaError",
        code: "HCA_EXECUTION_FAILED",
      });

      assert.strictEqual(
        Reflect.get(error, "shortMessage"),
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
          recording({ status: () => Promise.resolve({ status: "success", hashes: [zeroHash] }) })
            .executor,
        ],
      });
      const status = (via: Write.Via) =>
        Effect.promise(() => defined(via.status)("ref-1", context));

      const silentStatus = yield* status(silent);
      const reportedStatus = yield* status(reporting);

      assert.deepStrictEqual(silentStatus, { status: "pending" });
      assert.deepStrictEqual(reportedStatus, { status: "success", hashes: [zeroHash] });
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
        () => defined(hca().sender)({ ...makeClient().context, account: undefined }),
        { _tag: "HcaError", code: "HCA_NOT_VERIFIED" },
      );

      assert.strictEqual(
        Reflect.get(error, "shortMessage"),
        "An HCA write needs a signer: the HCA's owner.",
      );
    }),
  );
});

describe("hca route: sessions", () => {
  it.effect.each<readonly [string, HcaSession, string]>([
    ["of another owner", { ...session, owner: stranger }, "another owner"],
    ["for another account", { ...session, hca: stranger }, "another account"],
    ["that expired", { ...session, terms: { ...session.terms, validUntil: 1 } }, "expired"],
  ])("refuses a session %s", ([, invalid, detail]) =>
    Effect.gen(function* () {
      const via = hca({ executors: [recording().executor], session: invalid });

      const error = yield* expectRejection(
        () =>
          defined(via.prepare)(
            planOf([{ id: "a", description: "a", calls: [call] }]),
            makeClient({ deployed: true }).context,
          ),
        { _tag: "HcaError", code: "HCA_SESSION_INVALID" },
      );

      assert.deepStrictEqual(Reflect.get(error, "details"), [detail]);
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
          defined(via.prepare)(
            planOf([{ id: "a", description: "a", calls: [call] }]),
            makeClient({ deployed: true }).context,
          ),
        { _tag: "HcaError", code: "HCA_ACTION_NOT_ALLOWED" },
      );

      assert.deepStrictEqual(routed.steps, [signerStep]);
    }),
  );
});
