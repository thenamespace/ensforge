import { Duration, Effect } from "effect";

import type { Hex } from "viem";
import {
  getBlock,
  getCapabilities,
  sendCalls,
  sendTransaction,
  waitForCallsStatus,
} from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import type { Write } from "../../Types.js";
import { fromPromise } from "../rpc/fromPromise.js";
import { receiptsOf } from "./receipts.js";
import { addressOf, type Signer } from "./signer.js";
import { simulatableSteps, simulatePlan, simulateStep } from "./simulate.js";

const supportsAtomicBatch = (signer: Signer, chainId: number): Effect.Effect<boolean> =>
  fromPromise(() =>
    getCapabilities(signer.walletClient, { account: signer.account, chainId }),
  ).pipe(
    Effect.map((capabilities) => {
      const status = capabilities.atomic?.status;
      return status === "supported" || status === "ready";
    }),
    // Wallets without EIP-5792 reject the request; they get sequential transactions.
    Effect.orElseSucceed(() => false),
  );

const sendSequential = (client: Client, signer: Signer, step: Plan.Step) =>
  Effect.forEach(step.calls, (item) =>
    fromPromise(
      () =>
        sendTransaction(signer.walletClient, {
          account: signer.account,
          chain: signer.walletClient.chain ?? null,
          to: item.to,
          data: item.data,
          value: item.value,
        }),
      { contract: item.to, account: addressOf(signer.account), chainId: client.chain.id },
    ),
  );

// A batch has no transaction hash until it is included, so this waits for the bundle's receipts.
const sendBatch = Effect.fnUntraced(function* (client: Client, signer: Signer, step: Plan.Step) {
  const context = { account: addressOf(signer.account), chainId: client.chain.id };
  const { id } = yield* fromPromise(
    () =>
      sendCalls(signer.walletClient, {
        account: signer.account,
        ...(signer.walletClient.chain === undefined ? {} : { chain: signer.walletClient.chain }),
        calls: step.calls.map((item) => ({ to: item.to, data: item.data, value: item.value })),
        forceAtomic: true,
      }),
    context,
  );
  const status = yield* fromPromise(() => waitForCallsStatus(signer.walletClient, { id }), context);

  return { id, hashes: (status.receipts ?? []).map((receipt) => receipt.transactionHash) };
});

const useBatch = (signer: Signer, client: Client, step: Plan.Step, mode: Write.Mode) => {
  if (mode === "batch") return Effect.succeed(true);
  if (mode === "sequential" || step.calls.length < 2) return Effect.succeed(false);
  return supportsAtomicBatch(signer, client.chain.id);
};

/** Waits until the latest block's timestamp reaches `timestamp` (chain time, not wall time). */
const waitForChainTime = Effect.fnUntraced(function* (client: Client, timestamp: bigint) {
  for (;;) {
    const block = yield* fromPromise(() => getBlock(client.publicClient, { blockTag: "latest" }));
    if (block.timestamp >= timestamp) return;
    yield* Effect.sleep(Duration.seconds(Math.max(1, Number(timestamp - block.timestamp))));
  }
});

/**
 * Sends every step of a plan in order, simulating first unless disabled.
 *
 * Steps run one after another: each later step waits for the previous step's receipts, so it can
 * depend on them (register after commit, records after a resolver change). A step's `waitFor`
 * counts chain time from the block that confirmed the previous step. Steps that could not be
 * simulated up front are simulated right before they are sent.
 */
export const sendPlan = Effect.fnUntraced(function* (
  client: Client,
  plan: Plan,
  signer: Signer,
  options: Write.Options,
): Effect.fn.Return<Write.Result, AnyError> {
  const simulate = options.simulate ?? client.config.simulate;
  const account = addressOf(signer.account);
  if (simulate) {
    const simulation = yield* simulatePlan(client, plan, account);
    const failed = simulation.steps.find((step) => !step.ok);
    if (failed?.error !== undefined) return yield* Effect.fail(failed.error);
  }
  const simulatedUpFront = simulatableSteps(plan).length;

  const hashes: Hex[] = [];
  let previous: readonly Hex[] = [];
  let id: string | undefined;

  for (const [index, step] of plan.steps.entries()) {
    if (previous.length > 0) {
      const receipts = yield* receiptsOf(client, previous);
      const confirmed = receipts.at(-1);
      if (step.waitFor !== undefined && confirmed !== undefined) {
        const block = yield* fromPromise(() =>
          getBlock(client.publicClient, { blockNumber: confirmed.blockNumber }),
        );
        yield* waitForChainTime(client, block.timestamp + step.waitFor.seconds);
      }
    }
    if (simulate && index >= simulatedUpFront) {
      const result = yield* simulateStep(client, step, account);
      if (result.error !== undefined) return yield* Effect.fail(result.error);
    }

    let sent: readonly Hex[];
    if (yield* useBatch(signer, client, step, options.mode ?? "auto")) {
      const batch = yield* sendBatch(client, signer, step);
      id = batch.id;
      sent = batch.hashes;
    } else {
      sent = yield* sendSequential(client, signer, step);
    }
    hashes.push(...sent);
    previous = sent;
  }

  const hash = hashes.at(-1);
  // Planners never return empty plans; a write with nothing to send fails before this point.
  if (hash === undefined) throw new Error("plan produced no transactions");

  return { hash, hashes, id, plan };
});
