import { assert, describe, it } from "@effect/vitest";
import { Effect, Tracer } from "effect";

import { Actions as PromiseActions, Plan, type Write } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { make as makePlan } from "@ensforge/sdk/internal/plan/make";
import { expectFailure } from "@ensforge/test-harness";
import { getAddress, pad, type Address, type Hex } from "viem";

import { account, scriptedWallet, target } from "../write/wallet";

const bob = getAddress("0x0000000000000000000000000000000000000b0b");
const elsewhere: Address = "0x00000000000000000000000000000000000000dd";
const recorded = pad("0x99");

const planOf = (
  options: {
    readonly chainId?: number;
    readonly account?: Address;
    readonly to?: readonly Address[];
  } = {},
) =>
  makePlan({
    operation: "test",
    chainId: options.chainId ?? 1,
    account: options.account ?? account,
    steps: [
      {
        id: "a",
        description: "a",
        calls: (options.to ?? [target]).map((to) => ({ to, data: "0x01" as Hex, value: 0n })),
      },
      { id: "b", description: "b", calls: [{ to: target, data: "0x02", value: 0n }] },
    ],
  });

const recordOf = (plan: Plan, progress: Partial<Plan.Record> = {}): Plan.Record => ({
  plan,
  status: "failed",
  submitted: {},
  bundles: {},
  references: {},
  updatedAt: 1,
  ...progress,
});

/** A scripted wallet whose storage already holds `records`. */
const walletWith = (...records: readonly Plan.Record[]) =>
  Effect.gen(function* () {
    const storage = Plan.memoryStorage();
    yield* Effect.forEach(records, (record) => Effect.promise(() => storage.set(record)));
    return scriptedWallet({ storage });
  });

const ids = (records: readonly Plan.Record[]) => records.map((record) => record.plan.id);

/** Storage that fails every request. */
const brokenStorage: Plan.Storage = {
  get: () => Promise.reject(new Error("storage unavailable")),
  set: () => Promise.reject(new Error("storage unavailable")),
  delete: () => Promise.reject(new Error("storage unavailable")),
  list: () => Promise.reject(new Error("storage unavailable")),
};

describe("plan.get", () => {
  it.effect("reads a saved plan, or null for an unknown id", () =>
    Effect.gen(function* () {
      const record = recordOf(planOf());
      const { client } = yield* walletWith(record);

      assert.deepStrictEqual(yield* Actions.plan.get(client, { id: record.plan.id }), record);
      assert.strictEqual(yield* Actions.plan.get(client, { id: "unknown" }), null);
    }),
  );
});

describe("plan.list", () => {
  it.effect("lists this client's plans newest first, by status and account", () =>
    Effect.gen(function* () {
      const old = recordOf(planOf(), { status: "completed", updatedAt: 1 });
      const recent = recordOf(planOf(), { updatedAt: 3 });
      const bobs = recordOf(planOf({ account: bob }), { updatedAt: 2 });
      // A plan for a chain the client has no clients for.
      const elsewhereChain = recordOf(planOf({ chainId: 10 }), { updatedAt: 4 });
      const { client } = yield* walletWith(old, recent, bobs, elsewhereChain);

      assert.deepStrictEqual(ids(yield* Actions.plan.list(client, {})), [
        recent.plan.id,
        bobs.plan.id,
        old.plan.id,
      ]);
      assert.deepStrictEqual(ids(yield* Actions.plan.list(client, { status: "failed" })), [
        recent.plan.id,
        bobs.plan.id,
      ]);
      assert.deepStrictEqual(
        ids(yield* Actions.plan.list(client, { account: bob.toLowerCase() })),
        [bobs.plan.id],
      );
    }),
  );

  it.effect("rejects an invalid account", () =>
    Effect.gen(function* () {
      const { client } = yield* walletWith();

      const error = yield* expectFailure(Actions.plan.list(client, { account: "alice" }), {
        _tag: "InvalidInputError",
        code: "INVALID_ADDRESS",
      });

      assert.strictEqual(error.field, "account");
      assert.strictEqual(error.context.operation, "plan.list");
    }),
  );
});

describe("plan.reconcile", () => {
  it.effect.each<readonly [string, Address, readonly Address[]]>([
    ["sent by the plan's account", account, [elsewhere]],
    ["sent to one of the step's contracts", bob, [elsewhere, target]],
  ])("records a transaction %s as the step's submission", ([, planAccount, to]) =>
    Effect.gen(function* () {
      const record = recordOf(planOf({ account: planAccount, to }), {
        submitted: { b: [recorded] },
      });
      const { client } = yield* walletWith(record);
      const hash = pad("0x42");

      const updated = yield* Actions.plan.reconcile(client, {
        id: record.plan.id,
        step: "a",
        hash,
      });

      assert.deepStrictEqual(updated.submitted, { a: [hash], b: [recorded] });
      assert.deepStrictEqual(yield* Actions.plan.get(client, { id: record.plan.id }), updated);
    }),
  );

  it.effect(
    "refuses a transaction neither from the plan's account nor to the step's contracts",
    () =>
      Effect.gen(function* () {
        const record = recordOf(planOf({ account: bob, to: [elsewhere] }));
        const { client } = yield* walletWith(record);

        const error = yield* expectFailure(
          Actions.plan.reconcile(client, { id: record.plan.id, step: "a", hash: recorded }),
          { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
        );

        assert.strictEqual(error.field, "hash");
        assert.strictEqual(
          error.shortMessage,
          "The transaction is not from the plan's account or to the step's contracts.",
        );
        assert.deepStrictEqual(
          (yield* Actions.plan.get(client, { id: record.plan.id }))?.submitted,
          {},
        );
      }),
  );

  it.effect("refuses a malformed hash, an unknown plan and an unknown step", () =>
    Effect.gen(function* () {
      const record = recordOf(planOf());
      const { client, calls } = yield* walletWith(record);

      const malformed = yield* expectFailure(
        Actions.plan.reconcile(client, { id: record.plan.id, step: "a", hash: "0x1234" }),
        { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
      );
      yield* expectFailure(
        Actions.plan.reconcile(client, { id: "unknown", step: "a", hash: recorded }),
        {
          _tag: "NotFoundError",
          code: "PLAN_NOT_FOUND",
        },
      );
      const unknownStep = yield* expectFailure(
        Actions.plan.reconcile(client, { id: record.plan.id, step: "z", hash: recorded }),
        { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
      );

      assert.strictEqual(malformed.field, "hash");
      assert.strictEqual(malformed.shortMessage, "The hash must be 32 bytes.");
      assert.strictEqual(malformed.context.operation, "plan.reconcile");
      assert.strictEqual(unknownStep.field, "step");
      assert.strictEqual(unknownStep.shortMessage, "The plan has no step z.");
      assert.strictEqual(
        calls.filter(({ method }) => method === "eth_getTransactionByHash").length,
        0,
      );
    }),
  );
});

describe("plan.resume", () => {
  it.effect("sends the remaining steps, and resumeSync waits for every receipt", () =>
    Effect.gen(function* () {
      const plan = planOf();
      const [submitted, synced] = yield* Effect.forEach([false, true], (sync) =>
        Effect.gen(function* () {
          const wallet = yield* walletWith(recordOf(plan, { submitted: { a: [recorded] } }));
          const events: string[] = [];
          const options = {
            id: plan.id,
            onStep: (event: Plan.Event) => events.push(`${event.step.id} ${event.status}`),
          };
          const result = sync
            ? yield* Actions.plan.resumeSync(wallet.client, options)
            : yield* Actions.plan.resume(wallet.client, options);
          return { result, events, transactions: wallet.transactions() };
        }),
      );

      assert.deepStrictEqual(submitted?.transactions, [["0x02"]]);
      assert.deepStrictEqual(submitted?.events, ["a confirmed", "b submitted"]);
      assert.notProperty(submitted?.result, "receipts");
      assert.deepStrictEqual(synced?.events, ["a confirmed", "b submitted", "b confirmed"]);
      assert.deepStrictEqual(
        (synced?.result as Write.SyncResult | undefined)?.receipts.map(
          (receipt) => receipt.transactionHash,
        ),
        [recorded, pad("0x1")],
      );
    }),
  );

  it.effect("fails with the operation for an unknown plan", () =>
    Effect.gen(function* () {
      const { client } = yield* walletWith();

      const error = yield* expectFailure(Actions.plan.resume(client, { id: "unknown" }), {
        _tag: "NotFoundError",
        code: "PLAN_NOT_FOUND",
      });
      const synced = yield* expectFailure(Actions.plan.resumeSync(client, { id: "unknown" }), {
        _tag: "NotFoundError",
        code: "PLAN_NOT_FOUND",
      });

      assert.strictEqual(error.context.operation, "plan.resume");
      assert.strictEqual(synced.context.operation, "plan.resumeSync");
    }),
  );
});

describe("plan.send", () => {
  it.effect("submits with send, and waits for the receipts with sendSync", () =>
    Effect.gen(function* () {
      const plan = planOf();
      const [sent, synced] = yield* Effect.forEach([false, true], (sync) =>
        Effect.gen(function* () {
          const wallet = scriptedWallet();
          const events: string[] = [];
          const options = {
            plan,
            mode: "sequential" as const,
            onStep: (event: Plan.Event) => events.push(`${event.step.id} ${event.status}`),
          };
          const result = sync
            ? yield* Actions.plan.sendSync(wallet.client, options)
            : yield* Actions.plan.send(wallet.client, options);
          return { result, events, capabilities: wallet.count("wallet_getCapabilities") };
        }),
      );

      // The write's options reach the runtime: its mode and its listener.
      assert.strictEqual(sent?.capabilities, 0);
      assert.deepStrictEqual(sent?.events, ["a submitted", "a confirmed", "b submitted"]);
      assert.notProperty(sent?.result, "receipts");
      assert.deepStrictEqual(synced?.events, [
        "a submitted",
        "a confirmed",
        "b submitted",
        "b confirmed",
      ]);
      assert.strictEqual((synced?.result as Write.SyncResult | undefined)?.receipts.length, 2);
    }),
  );

  it.effect("checks the plan against the client's account when the write names none", () =>
    Effect.gen(function* () {
      const { client } = scriptedWallet();

      const error = yield* expectFailure(
        Actions.plan.send(client, { plan: planOf({ account: bob }) }),
        {
          _tag: "PlanError",
          code: "PLAN_ACCOUNT_MISMATCH",
        },
      );

      assert.strictEqual(error.context.operation, "plan.send");
    }),
  );

  it.effect(
    "simulates, estimates and routes as the client's account when the write names none",
    () =>
      Effect.gen(function* () {
        const wallet = scriptedWallet();
        const plan = planOf();
        const routed: (Address | undefined)[] = [];
        const via: Write.Via = {
          id: "rewrite",
          prepare: async (prepared, context) => {
            routed.push(context.account);
            return prepared;
          },
        };

        const simulation = yield* Actions.plan.send.simulate(wallet.client, { plan, via });
        yield* Actions.plan.send.estimateGas(wallet.client, { plan });

        assert.isTrue(simulation.ok);
        assert.deepStrictEqual(routed, [account]);
        const senders = (method: string) =>
          wallet.calls
            .filter((call) => call.method === method)
            .map(({ params }) => (params as readonly Record<string, unknown>[])[0]?.from);
        assert.deepStrictEqual(senders("eth_call"), [account, account]);
        assert.deepStrictEqual(senders("eth_estimateGas"), [account, account]);
      }),
  );

  it.effect("reports a step's simulated failure with the simulation's context", () =>
    Effect.gen(function* () {
      const wallet = scriptedWallet({ failingSimulation: ["0x02"] });

      const simulation = yield* Actions.plan.send.simulate(wallet.client, { plan: planOf() });

      assert.isFalse(simulation.ok);
      assert.deepStrictEqual(
        simulation.steps.map(({ id, ok }) => [id, ok]),
        [
          ["a", true],
          ["b", false],
        ],
      );
      assert.strictEqual(simulation.steps[1]?.error?.context.operation, "plan.send.simulate");
      assert.strictEqual(simulation.steps[0]?.error, undefined);
    }),
  );
});

/** The failure of a Promise-form action, as a value. */
const promised = (thunk: () => Promise<unknown>) =>
  Effect.flip(
    Effect.tryPromise({
      try: thunk,
      catch: (cause) => cause as { readonly context: { readonly operation?: string } },
    }),
  );

describe("plan actions, Promise forms", () => {
  it.effect("fail as their Effect forms do, with the same operation", () =>
    Effect.gen(function* () {
      const client = scriptedWallet({ storage: brokenStorage }).client;
      const operations = [
        yield* promised(() => PromiseActions.plan.get(client, { id: "a" })),
        yield* promised(() =>
          PromiseActions.plan.reconcile(client, { id: "a", step: "a", hash: recorded }),
        ),
        yield* promised(() => PromiseActions.plan.resume(client, { id: "a" })),
        yield* promised(() => PromiseActions.plan.resumeSync(client, { id: "a" })),
        yield* promised(() =>
          PromiseActions.plan.sendSync(client, { plan: planOf({ account: bob }) }),
        ),
      ].map((error) => error.context.operation);
      const effects = [yield* Effect.flip(Actions.plan.get(client, { id: "a" }))].map(
        (error) => error.context.operation,
      );

      assert.deepStrictEqual(operations, [
        "plan.get",
        "plan.reconcile",
        "plan.resume",
        "plan.resumeSync",
        "plan.sendSync",
      ]);
      assert.deepStrictEqual(effects, ["plan.get"]);
    }),
  );
});

describe("plan action spans", () => {
  // Spans are named `ensforge.<path>`, so traces show which action ran.
  it.effect("open one span per action, named after it", () =>
    Effect.gen(function* () {
      const plan = planOf();
      const { client } = yield* walletWith(recordOf(plan, { submitted: { a: [recorded] } }));
      const names: string[] = [];
      const tracer = Tracer.make({
        span: (options) => {
          names.push(options.name);
          return new Tracer.NativeSpan(options);
        },
      });

      yield* Effect.all([
        Actions.plan.get(client, { id: plan.id }),
        Actions.plan.list(client, {}),
        Effect.flip(Actions.plan.reconcile(client, { id: plan.id, step: "z", hash: recorded })),
        Actions.plan.resume(client, { id: plan.id }),
        Actions.plan.resumeSync(client, { id: plan.id }),
        Actions.plan.send.prepare(client, { plan }),
        Actions.plan.send.simulate(client, { plan }),
        Actions.plan.send.estimateGas(client, { plan }),
        Actions.plan.send(client, { plan }),
        Actions.plan.sendSync(client, { plan }),
      ]).pipe(Effect.withTracer(tracer));

      assert.deepStrictEqual(
        names.filter((name) => name.startsWith("ensforge.")),
        [
          "ensforge.plan.get",
          "ensforge.plan.list",
          "ensforge.plan.reconcile",
          "ensforge.plan.resume",
          "ensforge.plan.resumeSync",
          "ensforge.plan.send.prepare",
          "ensforge.plan.send.simulate",
          "ensforge.plan.send.estimateGas",
          "ensforge.plan.send",
          "ensforge.plan.sendSync",
        ],
      );
    }),
  );
});

describe("plan reads in a batch", () => {
  it.effect("answer each request by its action", () =>
    Effect.gen(function* () {
      const record = recordOf(planOf());
      const { client } = yield* walletWith(record);

      const { results } = yield* Actions.batch(client, {
        requests: [
          PromiseActions.plan.get.request({ id: record.plan.id }),
          PromiseActions.plan.list.request({}),
          PromiseActions.plan.reconcile.request({ id: record.plan.id, step: "a", hash: recorded }),
        ],
      });

      // The requests run together, so the reads may already see the reconciled step.
      assert.strictEqual(
        results[0]?.status === "success" ? results[0].result?.plan.id : undefined,
        record.plan.id,
      );
      assert.deepStrictEqual(
        results[1]?.status === "success" ? ids(results[1].result) : undefined,
        [record.plan.id],
      );
      assert.deepStrictEqual(
        results[2]?.status === "success" ? results[2].result.submitted : undefined,
        { a: [recorded] },
      );
    }),
  );
});
