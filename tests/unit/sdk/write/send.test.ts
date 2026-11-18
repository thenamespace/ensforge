import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Record as Rec } from "effect";

import type { Plan, Write } from "@ensforge/sdk";
import { sendPlan } from "@ensforge/sdk/internal/internal/write/send";
import { sendSequential } from "@ensforge/sdk/internal/internal/write/transport";
import { make as makePlan } from "@ensforge/sdk/internal/plan/make";
import { expectFailure } from "@ensforge/test-harness";
import { keccak256, numberToHex, pad, stringToHex, type Hex } from "viem";

import {
  account,
  advancing,
  minedAt,
  paramsOf,
  requestsOf,
  scriptedWallet,
  target,
} from "./wallet";

/** The hash of the `n`th transaction the scripted wallet sends. */
const sent = (n: number) => pad(numberToHex(n));

/** A step of one call per data, to the scripted target. */
const step = (id: string, data: readonly Hex[], extra: Partial<Plan.Step> = {}): Plan.Step => ({
  id,
  description: `step ${id}`,
  calls: Arr.map(data, (callData) => ({ to: target, data: callData, value: 0n })),
  ...extra,
});

const planOf = (...steps: readonly Plan.Step[]) =>
  makePlan({ operation: "test", chainId: 1, account, steps });

/** A record of `plan` saved by an earlier, interrupted write. */
const recordOf = (plan: Plan, progress: Partial<Plan.Record>): Plan.Record => ({
  plan,
  status: "failed",
  submitted: {},
  bundles: {},
  references: {},
  error: "interrupted",
  updatedAt: 1,
  ...progress,
});

/** Progress events as `id status` lines. */
const recorder = () => {
  const events: string[] = [];
  const onStep = (event: Plan.Event) => events.push(`${event.step.id} ${event.status}`);
  return { events, onStep };
};

describe("sendSequential", () => {
  // An approval and the payment that spends it: the payment is estimated after the approval lands.
  it.effect("sends each call only after the previous one is mined, with gas to spare", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();

      const hashes = yield* sendSequential(
        wallet.client,
        wallet.signer,
        step("pay", ["0x01", "0x02"]),
      );

      const sends = requestsOf(wallet.calls, "eth_sendTransaction");
      const order = Arr.filter(
        Arr.map(wallet.calls, ({ method }) => method),
        (method) => method === "eth_sendTransaction" || method === "eth_getTransactionReceipt",
      );
      assert.deepStrictEqual(hashes, [sent(1), sent(2)]);
      // Sent with a fifth more gas than estimated (21,000 → 25,200), from the signer, to the call.
      assert.deepStrictEqual(
        sends,
        Arr.map(["0x01", "0x02"], (data) => ({
          from: account,
          to: target,
          data,
          gas: "0x6270",
          value: "0x0",
        })),
      );
      assert.deepStrictEqual(order.slice(0, 3), [
        "eth_sendTransaction",
        "eth_getTransactionReceipt",
        "eth_sendTransaction",
      ]);
      assert.deepStrictEqual(
        Arr.map(requestsOf(wallet.calls, "eth_estimateGas"), (request) => request.from),
        [account, account],
      );
    }),
  );
});

describe("sendPlan", () => {
  it.effect("sends steps in order, each after the previous one's receipts, saving progress", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const plan = planOf(step("a", ["0x01"]), step("b", ["0x02"]));
      const { events, onStep } = recorder();

      const result = yield* advancing(sendPlan(wallet.client, plan, wallet.signer, { onStep }));

      assert.deepStrictEqual(result, {
        hash: sent(2),
        hashes: [sent(1), sent(2)],
        id: undefined,
        plan,
      });
      assert.deepStrictEqual(wallet.transactions(), [["0x01"], ["0x02"]]);
      assert.deepStrictEqual(events, ["a submitted", "a confirmed", "b submitted"]);
      const methods = Arr.map(wallet.calls, ({ method }) => method);
      assert.isBelow(
        methods.indexOf("eth_getTransactionReceipt"),
        methods.lastIndexOf("eth_sendTransaction"),
      );
      // The wallet is asked once whether it sends bundles; the answer holds for the whole plan.
      assert.strictEqual(wallet.count("wallet_getCapabilities"), 1);
      assert.deepStrictEqual(
        Arr.map(wallet.saved, (record) => [record.status, Rec.keys(record.submitted)]),
        [
          ["pending", []],
          ["pending", ["a"]],
          ["pending", ["a", "b"]],
          ["completed", ["a", "b"]],
        ],
      );
      assert.deepStrictEqual(wallet.saved.at(-1), {
        plan,
        status: "completed",
        submitted: { a: [sent(1)], b: [sent(2)] },
        bundles: {},
        references: {},
        error: undefined,
        updatedAt: 0,
      });
    }),
  );

  // `…Sync` writes wait for the last step too; its listeners hear it confirmed like the others.
  it.effect("reports the last step confirmed when asked to wait for it", () =>
    Effect.gen(function* () {
      const plan = planOf(step("only", ["0x01"]));

      const [waited, submitted] = yield* Effect.forEach(
        [true, false],
        (confirmLast) =>
          Effect.gen(function* () {
            const wallet = scriptedWallet();
            const { events, onStep } = recorder();
            yield* sendPlan(wallet.client, plan, wallet.signer, {
              mode: "sequential",
              confirmLast,
              onStep,
            });
            return events;
          }),
        { concurrency: 1 },
      );

      assert.deepStrictEqual(waited, ["only submitted", "only confirmed"]);
      assert.deepStrictEqual(submitted, ["only submitted"]);
    }),
  );

  it.effect(
    "simulates the plan first, with the client's setting, and sends nothing that would revert",
    () =>
      Effect.gen(function* () {
        const wallet = scriptedWallet({ simulate: true, failingSimulation: ["0x02"] });

        yield* expectFailure(
          sendPlan(
            wallet.client,
            planOf(step("a", ["0x01"]), step("b", ["0x02"])),
            wallet.signer,
            {},
          ),
          { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" },
        );

        assert.deepStrictEqual(wallet.transactions(), []);
        assert.deepStrictEqual(wallet.saved, []);
      }),
  );

  it.effect("waits for chain time counted from the block that confirmed the previous step", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ latest: [minedAt + 59n, minedAt + 60n] });
      const plan = planOf(
        step("commit", ["0x01"]),
        step("register", ["0x02"], {
          waitFor: { seconds: 60n },
        }),
      );
      const { events, onStep } = recorder();

      yield* advancing(sendPlan(wallet.client, plan, wallet.signer, { onStep }));

      assert.deepStrictEqual(events, [
        "commit submitted",
        "commit confirmed",
        "register waiting",
        "register submitted",
      ]);
      assert.deepStrictEqual(
        Arr.map(
          Arr.filter(wallet.calls, ({ method }) => method === "eth_getBlockByNumber"),
          ({ params }) => paramsOf(params)[0],
        ),
        ["0x1", "latest", "latest"],
      );
    }),
  );

  // Steps after a wait depend on time passing, so they are simulated right before they are sent;
  // the ones before it were simulated up front and are not simulated again.
  it.effect("simulates each step once, those after a wait right before sending them", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ simulate: true, latest: [minedAt + 60n] });
      const plan = planOf(
        step("commit", ["0x01"]),
        step("register", ["0x02"], {
          waitFor: { seconds: 60n },
        }),
      );

      yield* advancing(sendPlan(wallet.client, plan, wallet.signer, {}));

      const simulated = Arr.map(requestsOf(wallet.calls, "eth_call"), (request) => request.data);
      assert.deepStrictEqual(simulated, ["0x01", "0x02"]);
    }),
  );

  it.effect("fails a step that would revert after its wait, saving the failure", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({
        simulate: true,
        failingSimulation: ["0x02"],
        latest: [minedAt + 60n],
      });
      const plan = planOf(
        step("commit", ["0x01"]),
        step("register", ["0x02"], {
          waitFor: { seconds: 60n },
        }),
      );
      const { events, onStep } = recorder();

      const error = yield* expectFailure(
        advancing(sendPlan(wallet.client, plan, wallet.signer, { onStep })),
        { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" },
      );

      assert.strictEqual(error.context.planId, plan.id);
      assert.strictEqual(error.context.step, "register");
      assert.deepStrictEqual(wallet.transactions(), [["0x01"]]);
      assert.deepStrictEqual(events.at(-1), "register failed");
      const last = wallet.saved.at(-1);
      assert.strictEqual(last?.status, "failed");
      assert.strictEqual(last?.error, error.shortMessage);
      assert.deepStrictEqual(last?.submitted, { commit: [sent(1)] });
    }),
  );

  it.effect("does not simulate when the write turns simulation off", () =>
    Effect.gen(function* () {
      // Any simulation would fail this write.
      const wallet = scriptedWallet({
        simulate: true,
        failingSimulation: ["0x01", "0x02"],
        latest: [minedAt + 60n],
      });
      const plan = planOf(
        step("commit", ["0x01"]),
        step("register", ["0x02"], {
          waitFor: { seconds: 60n },
        }),
      );

      yield* advancing(sendPlan(wallet.client, plan, wallet.signer, { simulate: false }));

      assert.strictEqual(wallet.count("eth_call"), 0);
    }),
  );

  it.effect(
    "fails with the plan and step on the error, and reports and saves the failed step",
    () =>
      Effect.gen(function* () {
        const wallet = scriptedWallet({ refused: ["0x02"] });
        const plan = planOf(step("a", ["0x01"]), step("b", ["0x02"]));
        const { events, onStep } = recorder();

        const error = yield* expectFailure(
          advancing(sendPlan(wallet.client, plan, wallet.signer, { onStep })),
          { _tag: "UserRejectedError", code: "USER_REJECTED" },
        );

        assert.strictEqual(error.context.planId, plan.id);
        assert.strictEqual(error.context.step, "b");
        assert.strictEqual(error.context.contract, target);
        assert.deepStrictEqual(events, ["a submitted", "a confirmed", "b failed"]);
        assert.deepStrictEqual(wallet.saved.at(-1)?.status, "failed");
        assert.deepStrictEqual(wallet.saved.at(-1)?.submitted, { a: [sent(1)] });
      }),
  );

  // Every step was sent: the failure belongs to no step, so no step is reported failed.
  it.effect("fails without blaming a step when the last receipts revert", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ reverting: ["0x01"] });
      const plan = planOf(step("a", ["0x01"]));
      const { events, onStep } = recorder();

      const error = yield* expectFailure(
        sendPlan(wallet.client, plan, wallet.signer, { confirmLast: true, onStep }),
        { _tag: "TransactionError", code: "TRANSACTION_REVERTED" },
      );

      assert.strictEqual(error.context.planId, plan.id);
      assert.strictEqual(error.context.step, undefined);
      assert.deepStrictEqual(events, ["a submitted"]);
      assert.strictEqual(wallet.saved.at(-1)?.status, "failed");
    }),
  );
});

describe("sendPlan bundles", () => {
  it.effect("joins consecutive steps up to maxBundleCalls, never across a wait", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ atomic: "supported", latest: [minedAt + 10n] });
      const plan = planOf(
        step("a", ["0x01", "0x02"]),
        step("b", ["0x03"]),
        step("c", ["0x04", "0x05"]),
        step("d", ["0x06"], { waitFor: { seconds: 1n } }),
      );
      const { events, onStep } = recorder();

      yield* advancing(sendPlan(wallet.client, plan, wallet.signer, { maxBundleCalls: 3, onStep }));

      // A step alone with one call goes as a plain transaction.
      assert.deepStrictEqual(wallet.transactions(), [
        ["0x01", "0x02", "0x03"],
        ["0x04", "0x05"],
        ["0x06"],
      ]);
      assert.deepStrictEqual(events, [
        "a submitted",
        "b submitted",
        "a confirmed",
        "b confirmed",
        "c submitted",
        "c confirmed",
        "d waiting",
        "d submitted",
      ]);
      const record = wallet.saved.at(-1);
      assert.deepStrictEqual(record?.bundles, {
        a: `bundle-${sent(1)}`,
        b: `bundle-${sent(1)}`,
        c: `bundle-${sent(2)}`,
      });
      assert.deepStrictEqual(record?.submitted, {
        a: [sent(1)],
        b: [sent(1)],
        c: [sent(2)],
        d: [sent(3)],
      });
    }),
  );

  // MetaMask's limit.
  it.effect("puts at most 10 calls in a bundle by default", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ atomic: "supported" });
      const steps = Array.from({ length: 11 }, (_, index) =>
        step(`s${index}`, [numberToHex(index + 1)]),
      );

      yield* advancing(sendPlan(wallet.client, planOf(...steps), wallet.signer, {}));

      assert.deepStrictEqual(
        Arr.map(wallet.transactions(), (calls) => calls.length),
        [10, 1],
      );
    }),
  );

  it.effect("returns the bundle that carried the plan", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ atomic: "supported" });
      const plan = planOf(step("a", ["0x01", "0x02"]));

      const result = yield* advancing(sendPlan(wallet.client, plan, wallet.signer, {}));

      assert.deepStrictEqual(result, {
        hash: sent(1),
        hashes: [sent(1)],
        id: `bundle-${sent(1)}`,
        plan,
      });
    }),
  );

  it.effect.each<readonly [string, Parameters<typeof scriptedWallet>[0], Write.Options, string[]]>([
    // A wallet that would first ask to upgrade the account (EIP-7702) is not asked to bundle.
    ["a wallet that needs an account upgrade", { atomic: "ready" }, {}, ["0x01", "0x02"]],
    ["a wallet without EIP-5792", {}, {}, ["0x01", "0x02"]],
    ["mode sequential", { atomic: "supported" }, { mode: "sequential" }, ["0x01", "0x02"]],
  ])("sends one transaction per call with %s", ([, wallet, options]) =>
    Effect.gen(function* () {
      const scripted = scriptedWallet(wallet);

      yield* advancing(
        sendPlan(scripted.client, planOf(step("a", ["0x01", "0x02"])), scripted.signer, options),
      );

      assert.deepStrictEqual(scripted.transactions(), [["0x01"], ["0x02"]]);
      assert.strictEqual(scripted.count("wallet_sendCalls"), 0);
    }),
  );

  it.effect.each<readonly [string, Write.Options, unknown]>([
    ["mode batch", { mode: "batch" }, undefined],
    [
      "a paymaster",
      { paymaster: { url: "https://paymaster.example", context: { policy: "p" } } },
      { paymasterService: { url: "https://paymaster.example", context: { policy: "p" } } },
    ],
    [
      "a paymaster without context",
      { paymaster: { url: "https://paymaster.example" } },
      { paymasterService: { url: "https://paymaster.example" } },
    ],
  ])("bundles even a single call with %s, without asking the wallet", ([, options, capabilities]) =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();

      const result = yield* advancing(
        sendPlan(wallet.client, planOf(step("a", ["0x01"])), wallet.signer, options),
      );

      assert.strictEqual(result.id, `bundle-${sent(1)}`);
      assert.strictEqual(wallet.count("wallet_getCapabilities"), 0);
      const [request] = requestsOf(wallet.calls, "wallet_sendCalls");
      assert.deepStrictEqual(request?.capabilities, capabilities);
      assert.strictEqual(request?.atomicRequired, true);
      assert.deepStrictEqual(wallet.saved.at(-1)?.bundles, { a: `bundle-${sent(1)}` });
    }),
  );
});

describe("sendPlan resume", () => {
  const recorded = pad("0x99");

  it.effect("confirms a step submitted before instead of sending it again", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const plan = planOf(step("a", ["0x01"]), step("b", ["0x02"]));
      const { events, onStep } = recorder();

      const result = yield* advancing(
        sendPlan(
          wallet.client,
          plan,
          wallet.signer,
          { onStep },
          recordOf(plan, { submitted: { a: [recorded] } }),
        ),
      );

      assert.deepStrictEqual(result.hashes, [recorded, sent(1)]);
      assert.deepStrictEqual(wallet.transactions(), [["0x02"]]);
      assert.deepStrictEqual(events, ["a confirmed", "b submitted"]);
      assert.strictEqual(wallet.count("wallet_getCallsStatus"), 0);
      // The resumed record is pending again, then completed without its old error.
      assert.strictEqual(wallet.saved[0]?.status, "pending");
      const last = wallet.saved.at(-1);
      assert.deepStrictEqual(last, {
        ...recordOf(plan, { submitted: { a: [recorded], b: [sent(1)] } }),
        status: "completed",
        error: undefined,
        updatedAt: last?.updatedAt ?? 0,
      });
    }),
  );

  it.effect.each<readonly [string, Plan.Record["submitted"], readonly Hex[]]>([
    ["one of its transactions was dropped", { a: [recorded, pad("0x98")] }, [recorded]],
    ["it was recorded without transactions", { a: [] }, []],
  ])("sends a step again when %s", ([, submitted, dropped]) =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ dropped });
      const plan = planOf(step("a", ["0x01", "0x02"]));

      yield* advancing(
        sendPlan(wallet.client, plan, wallet.signer, {}, recordOf(plan, { submitted })),
      );

      assert.deepStrictEqual(wallet.transactions(), [["0x01"], ["0x02"]]);
    }),
  );

  // Its earlier steps changed the state, so each remaining step is simulated on its own.
  it.effect("simulates only the remaining steps, each right before it is sent", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ simulate: true });
      const plan = planOf(step("a", ["0x01"]), step("b", ["0x02"]), step("c", ["0x03"]));

      yield* advancing(
        sendPlan(
          wallet.client,
          plan,
          wallet.signer,
          {},
          recordOf(plan, { submitted: { a: [recorded] } }),
        ),
      );

      const simulated = Arr.map(requestsOf(wallet.calls, "eth_call"), (request) => request.data);
      assert.deepStrictEqual(simulated, ["0x02", "0x03"]);
    }),
  );

  it.effect("never bundles a step with one already submitted", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ atomic: "supported" });
      const plan = planOf(step("a", ["0x01"]), step("b", ["0x02"]), step("c", ["0x03"]));

      yield* advancing(
        sendPlan(
          wallet.client,
          plan,
          wallet.signer,
          {},
          recordOf(plan, { submitted: { b: [recorded] } }),
        ),
      );

      assert.deepStrictEqual(wallet.transactions(), [["0x01"], ["0x03"]]);
    }),
  );

  it.effect("waits for a pending bundle sent before and takes its transactions", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ bundleStatuses: [100, 100, 200] });
      const plan = planOf(step("a", ["0x01", "0x02"]), step("b", ["0x03"]));

      const result = yield* advancing(
        sendPlan(
          wallet.client,
          plan,
          wallet.signer,
          {},
          recordOf(plan, { bundles: { a: `bundle-${recorded}` } }),
        ),
      );

      assert.deepStrictEqual(result.hashes, [recorded, sent(1)]);
      assert.deepStrictEqual(wallet.transactions(), [["0x03"]]);
      assert.strictEqual(wallet.count("wallet_getCallsStatus"), 3);
    }),
  );

  it.effect.each([
    ["it failed", 500],
    ["the wallet no longer knows it", "unknown"],
  ] as const)("sends a bundled step again when %s", ([, status]) =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ bundleStatuses: [status] });
      const plan = planOf(step("a", ["0x01", "0x02"]));

      yield* advancing(
        sendPlan(
          wallet.client,
          plan,
          wallet.signer,
          {},
          recordOf(plan, { bundles: { a: `bundle-${recorded}` } }),
        ),
      );

      assert.deepStrictEqual(wallet.transactions(), [["0x01"], ["0x02"]]);
    }),
  );

  // Records saved before routes existed have no `references`.
  it.effect("resumes a record saved without route references", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const plan = planOf(step("a", ["0x01"]));
      const { references: _, ...record } = recordOf(plan, {});

      const result = yield* advancing(sendPlan(wallet.client, plan, wallet.signer, {}, record));

      assert.deepStrictEqual(result.hashes, [sent(1)]);
    }),
  );

  // Sending again from the wallet would run the routed step twice.
  it.effect("refuses to resume a routed plan without its route", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const plan = planOf(step("a", ["0x01"]), step("b", ["0x02"]));

      yield* expectFailure(
        sendPlan(
          wallet.client,
          plan,
          wallet.signer,
          {},
          recordOf(plan, { references: { a: "ref-a" } }),
        ),
        { _tag: "PlanError", code: "PLAN_ROUTE_REQUIRED" },
      );

      assert.deepStrictEqual(wallet.transactions(), []);
      assert.deepStrictEqual(wallet.saved, []);
    }),
  );
});

/** The transaction a route reports for `reference`. */
const routed = (reference: string) => keccak256(stringToHex(reference));

/** A route that sends each step as `ref-<id>` and reports it pending once, then mined. */
const relay = (statuses: Readonly<Record<string, Write.Via.Status>> = {}) => {
  const sentSteps: Plan.Step[] = [];
  const polls = new Map<string, number>();
  const via: Write.Via = {
    id: "relay",
    send: (sentStep) => {
      sentSteps.push(sentStep);
      return Promise.resolve(`ref-${sentStep.id}`);
    },
    status: (reference) => {
      const poll = polls.get(reference) ?? 0;
      polls.set(reference, poll + 1);
      const status = statuses[reference];
      if (status !== undefined) return Promise.resolve(status);
      return Promise.resolve(
        poll === 0 ? { status: "pending" } : { status: "success", hashes: [routed(reference)] },
      );
    },
  };
  return { via, sentSteps };
};

describe("sendPlan routes", () => {
  it.effect("sends routed steps through the route and the signer's steps from the wallet", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ atomic: "supported" });
      const { via, sentSteps } = relay();
      const plan = planOf(
        step("a", ["0x01", "0x02"]),
        step("b", ["0x03"], { from: "signer" }),
        step("c", ["0x04"]),
      );
      const { events, onStep } = recorder();

      const result = yield* advancing(
        sendPlan(wallet.client, plan, wallet.signer, { via, onStep }),
      );

      // Routes never bundle: the wallet is not asked, and each routed step goes alone.
      assert.deepStrictEqual(sentSteps, [plan.steps[0], plan.steps[2]]);
      assert.deepStrictEqual(wallet.transactions(), [["0x03"]]);
      assert.strictEqual(wallet.count("wallet_getCapabilities"), 0);
      assert.deepStrictEqual(result.hashes, [routed("ref-a"), sent(1), routed("ref-c")]);
      assert.deepStrictEqual(events, [
        "a submitted",
        "a confirmed",
        "b submitted",
        "b confirmed",
        "c submitted",
      ]);
      const record = wallet.saved.at(-1);
      assert.deepStrictEqual(record?.references, { a: "ref-a", c: "ref-c" });
      assert.deepStrictEqual(record?.submitted, {
        a: [routed("ref-a")],
        b: [sent(1)],
        c: [routed("ref-c")],
      });
    }),
  );

  it.effect("reports a routed step submitted with its reference as soon as it is sent", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const { via } = relay();
      const events: Plan.Event[] = [];

      yield* advancing(
        sendPlan(wallet.client, planOf(step("a", ["0x01"])), wallet.signer, {
          via,
          onStep: (event) => events.push(event),
        }),
      );

      assert.deepStrictEqual(
        Arr.map(events, ({ status, reference, hashes }) => ({ status, reference, hashes })),
        [{ status: "submitted", reference: "ref-a", hashes: undefined }],
      );
      // The reference is saved before the route reports the step mined.
      assert.deepStrictEqual(wallet.saved[1]?.references, { a: "ref-a" });
      assert.deepStrictEqual(wallet.saved[1]?.submitted, {});
    }),
  );

  // A route without `send` only rewrites the plan; the wallet sends it as usual.
  it.effect("sends from the wallet with a route that does not send", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ atomic: "supported" });
      const via: Write.Via = { id: "rewrite", prepare: (plan) => Promise.resolve(plan) };

      yield* advancing(
        sendPlan(wallet.client, planOf(step("a", ["0x01", "0x02"])), wallet.signer, { via }),
      );

      assert.deepStrictEqual(wallet.transactions(), [["0x01", "0x02"]]);
    }),
  );

  it.effect("follows a step the route sent before instead of sending it again", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const { via, sentSteps } = relay();
      const plan = planOf(step("a", ["0x01"]), step("b", ["0x02"]));

      const result = yield* advancing(
        sendPlan(
          wallet.client,
          plan,
          wallet.signer,
          { via },
          recordOf(plan, { references: { a: "ref-a" } }),
        ),
      );

      assert.deepStrictEqual(sentSteps, [plan.steps[1]]);
      assert.deepStrictEqual(result.hashes, [routed("ref-a"), routed("ref-b")]);
    }),
  );

  it.effect("sends a routed step again when it failed before landing", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet();
      const { via, sentSteps } = relay({ "ref-old": { status: "failed", reason: "dropped" } });
      const plan = planOf(step("a", ["0x01"]));

      yield* advancing(
        sendPlan(
          wallet.client,
          plan,
          wallet.signer,
          { via },
          recordOf(plan, { references: { a: "ref-old" } }),
        ),
      );

      assert.deepStrictEqual(sentSteps, [plan.steps[0]]);
    }),
  );
});
