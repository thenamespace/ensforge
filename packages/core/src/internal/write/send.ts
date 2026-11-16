import { Duration, Effect } from "effect";

import type { Hex } from "viem";
import { getCapabilities, sendCalls, sendTransaction, waitForCallsStatus } from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import type { Write } from "../../Types.js";
import { fromPromise } from "../rpc/fromPromise.js";
import { addressOf, type Signer } from "./signer.js";
import { simulatePlan } from "./simulate.js";

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

/**
 * Sends every step of a plan in order, simulating first unless disabled. Steps with `waitFor`
 * sleep before sending.
 */
export const sendPlan = Effect.fnUntraced(function* (
  client: Client,
  plan: Plan,
  signer: Signer,
  options: Write.Options,
): Effect.fn.Return<Write.Result, AnyError> {
  if (options.simulate ?? client.config.simulate) {
    const simulation = yield* simulatePlan(client, plan, addressOf(signer.account));
    const failed = simulation.steps.find((step) => !step.ok);
    if (failed?.error !== undefined) return yield* Effect.fail(failed.error);
  }

  const hashes: Hex[] = [];
  let id: string | undefined;

  for (const step of plan.steps) {
    if (step.waitFor !== undefined)
      yield* Effect.sleep(Duration.seconds(Number(step.waitFor.seconds)));

    if (yield* useBatch(signer, client, step, options.mode ?? "auto")) {
      const batch = yield* sendBatch(client, signer, step);
      id = batch.id;
      hashes.push(...batch.hashes);
    } else {
      hashes.push(...(yield* sendSequential(client, signer, step)));
    }
  }

  const hash = hashes.at(-1);
  // Planners never return empty plans; a write with nothing to send fails before this point.
  if (hash === undefined) throw new Error("plan produced no transactions");

  return { hash, hashes, id, plan };
});
