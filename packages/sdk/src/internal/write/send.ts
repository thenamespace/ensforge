import { Effect } from "effect";

import type { Hex } from "viem";
import { getBlock, getTransaction } from "viem/actions";

import type { Client } from "../../client/types.js";
import { PlanError } from "../../errors/classes/PlanError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import type { Write } from "../../Types.js";
import { fromPromise } from "../rpc/fromPromise.js";
import { receiptsOf } from "./receipts.js";
import { addressOf, type Signer } from "./signer.js";
import { simulatableSteps, simulatePlan, simulateStep } from "./simulate.js";
import {
  bundleOutcome,
  sendBatch,
  sendSequential,
  supportsAtomicBatch,
  waitForChainTime,
} from "./transport.js";
import { routeOutcome, sendThroughRoute, viaContext } from "./via.js";

/** MetaMask's limit; other wallets accept more, which `maxBundleCalls` allows. */
const defaultMaxBundleCalls = 10;

/** A record for a plan that has not sent anything yet. */
export const freshRecord = (plan: Plan): Plan.Record => ({
  plan,
  status: "pending",
  submitted: {},
  bundles: {},
  references: {},
  updatedAt: Date.now(),
});

/** Whether every one of `hashes` is known to the chain (mined or in the mempool). */
const known = (client: Client, hashes: readonly Hex[]) =>
  Effect.forEach(hashes, (hash) =>
    fromPromise(() => getTransaction(client.publicClient, { hash })).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    ),
  ).pipe(Effect.map((found) => found.length > 0 && found.every(Boolean)));

/**
 * Sends the steps of a plan in order, simulating first unless disabled, and saves progress to the
 * client's plan storage after every submission so `plan.resume` can continue it.
 *
 * - Each step waits for the previous one's receipts, so it can depend on them, and without a
 *   bundle each call of a step waits for the one before; a step's `waitFor` counts chain time
 *   from the block that confirmed the previous step.
 * - With a wallet that sends atomic bundles, consecutive steps without a wait share one bundle,
 *   up to `maxBundleCalls` calls: they run in order inside it, as the up-front simulation did.
 * - Resuming (`resumed`), steps already submitted are confirmed instead of sent again; a dropped
 *   transaction or a failed bundle is sent again, after simulating it against current state.
 * - With a route that sends (`via.send`), each step goes through the route instead; its reference
 *   is saved so a resumed write follows it instead of sending again.
 * - With `paymaster`, every step goes through `wallet_sendCalls` with the paymaster service.
 */
export const sendPlan = Effect.fnUntraced(function* (
  client: Client,
  plan: Plan,
  signer: Signer,
  options: Write.Options & Pick<Write.SyncOptions, "timeout">,
  resumed?: Plan.Record,
): Effect.fn.Return<Write.Result, AnyError> {
  const simulate = options.simulate ?? client.config.simulate;
  const account = addressOf(signer.account);
  const mode = options.mode ?? "auto";
  const maxBundleCalls = options.maxBundleCalls ?? defaultMaxBundleCalls;
  const emit = (event: Plan.Event) => options.onStep?.(event);
  const route = options.via?.send === undefined ? undefined : options.via;
  const routeContext = route === undefined ? undefined : yield* viaContext(client, account);
  // Steps sent through a route are only known to that route; sending them again from the wallet
  // would execute them twice.
  if (route === undefined && Object.keys(resumed?.references ?? {}).length > 0) {
    return yield* Effect.fail(new PlanError({ code: "PLAN_ROUTE_REQUIRED" }));
  }

  let record = resumed ?? freshRecord(plan);
  // Saving is best effort: storage that is unavailable (server rendering) must not stop a write.
  const save = (update: Partial<Plan.Record>) => {
    record = { ...record, ...update, updatedAt: Date.now() };
    return Effect.ignore(fromPromise(() => client.config.storage.set(record)));
  };

  // A resumed plan is simulated step by step: its earlier steps already changed the state.
  if (simulate && resumed === undefined) {
    const simulation = yield* simulatePlan(client, plan, account);
    const failed = simulation.steps.find((step) => !step.ok);
    if (failed?.error !== undefined) return yield* Effect.fail(failed.error);
  }
  const simulatedUpFront = resumed === undefined ? simulatableSteps(plan).length : 0;
  yield* save({ status: "pending" });

  let atomic: boolean | undefined;
  const bundles = Effect.gen(function* () {
    if (route !== undefined) return false;
    if (mode === "batch" || options.paymaster !== undefined) return true;
    if (mode === "sequential") return false;
    atomic ??= yield* supportsAtomicBatch(signer, client.chain.id);
    return atomic;
  });

  const hashes: Hex[] = [];
  let previous: { readonly steps: readonly Plan.Step[]; readonly hashes: readonly Hex[] } = {
    steps: [],
    hashes: [],
  };
  let id: string | undefined;
  let index = 0;

  const run = Effect.gen(function* () {
    while (index < plan.steps.length) {
      const step = plan.steps[index] as Plan.Step;

      // Resuming: a step submitted before is confirmed, unless its transactions vanished.
      const recorded = yield* recordedHashes(client, signer, record, step, route, routeContext);
      if (recorded !== undefined) {
        hashes.push(...recorded);
        previous = { steps: [step], hashes: recorded };
        index += 1;
        continue;
      }

      if (previous.hashes.length > 0) {
        const receipts = yield* receiptsOf(client, previous.hashes);
        for (const done of previous.steps)
          emit({ step: done, status: "confirmed", hashes: previous.hashes });
        const confirmed = receipts.at(-1);
        if (step.waitFor !== undefined && confirmed !== undefined) {
          emit({ step, status: "waiting" });
          const block = yield* fromPromise(() =>
            getBlock(client.publicClient, { blockNumber: confirmed.blockNumber }),
          );
          yield* waitForChainTime(client, block.timestamp + step.waitFor.seconds);
        }
      }

      // Consecutive steps without a wait join one bundle when the wallet sends bundles.
      const group = [step];
      const bundled = yield* bundles;
      if (bundled) {
        for (
          let next = plan.steps[index + 1];
          next !== undefined;
          next = plan.steps[index + group.length]
        ) {
          const calls = group.reduce((total, member) => total + member.calls.length, 0);
          if (
            next.waitFor !== undefined ||
            record.submitted[next.id] !== undefined ||
            calls + next.calls.length > maxBundleCalls
          ) {
            break;
          }
          group.push(next);
        }
      }
      const merged: Plan.Step = {
        id: group.map((member) => member.id).join("+"),
        description: group.map((member) => member.description).join(", "),
        calls: group.flatMap((member) => member.calls),
      };

      if (simulate && index + group.length > simulatedUpFront) {
        const result = yield* simulateStep(client, merged, account);
        if (result.error !== undefined) return yield* Effect.fail(result.error);
      }

      let sent: readonly Hex[];
      let reference: string | undefined;
      if (route !== undefined && routeContext !== undefined && step.from !== "signer") {
        sent = yield* sendThroughRoute(route, routeContext, merged, (sentReference) => {
          reference = sentReference;
          emit({ step, status: "submitted", reference: sentReference });
          return save({ references: { ...record.references, [step.id]: sentReference } });
        });
      } else if (
        bundled &&
        (merged.calls.length > 1 || mode === "batch" || options.paymaster !== undefined)
      ) {
        const batch = yield* sendBatch(client, signer, merged, options.timeout, options.paymaster);
        id = batch.id;
        sent = batch.hashes;
        yield* save({
          bundles: {
            ...record.bundles,
            ...Object.fromEntries(group.map((member) => [member.id, batch.id])),
          },
        });
      } else {
        sent = yield* sendSequential(client, signer, merged);
      }

      yield* save({
        submitted: {
          ...record.submitted,
          ...Object.fromEntries(group.map((member) => [member.id, sent])),
        },
      });
      // A routed step reported `submitted` with its reference as soon as it was sent.
      if (reference === undefined) {
        for (const member of group)
          emit({ step: member, status: "submitted", hashes: sent, bundleId: id });
      }
      hashes.push(...sent);
      previous = { steps: group, hashes: sent };
      index += group.length;
    }
  });

  yield* run.pipe(
    Effect.tapError((error) => {
      const step = plan.steps[index];
      if (step !== undefined) emit({ step, status: "failed", error });
      return save({ status: "failed", error: error.shortMessage });
    }),
    Effect.mapError(
      (error) => error.withContext({ planId: plan.id, step: plan.steps[index]?.id }) as AnyError,
    ),
  );
  yield* save({ status: "completed", error: undefined });

  const hash = hashes.at(-1);
  // Planners never return empty plans; a write with nothing to send fails before this point.
  if (hash === undefined) throw new Error("plan produced no transactions");

  return { hash, hashes, id, plan };
});

/**
 * The transactions a resumed step was submitted with, once confirmed to exist; `undefined` when
 * the step still has to be sent (never sent, dropped, or its bundle failed).
 */
const recordedHashes = Effect.fnUntraced(function* (
  client: Client,
  signer: Signer,
  record: Plan.Record,
  step: Plan.Step,
  route: Write.Via | undefined,
  routeContext: Write.Via.Context | undefined,
): Effect.fn.Return<readonly Hex[] | undefined, AnyError> {
  const submitted = record.submitted[step.id];
  if (submitted !== undefined && submitted.length > 0) {
    return (yield* known(client, submitted)) ? submitted : undefined;
  }

  // Sent through a route: ask it; a failure before landing sends the step again.
  const reference = record.references?.[step.id];
  if (reference !== undefined && route !== undefined && routeContext !== undefined) {
    return yield* routeOutcome(route, routeContext, reference);
  }

  const bundle = record.bundles[step.id];
  if (bundle === undefined) return undefined;
  // A bundle sent without its receipts yet: ask the wallet, waiting while it is pending.
  for (;;) {
    const outcome = yield* bundleOutcome(signer, bundle);
    if (outcome === "failed") return undefined;
    if (outcome !== "pending") return outcome;
    yield* Effect.sleep("4 seconds");
  }
});
