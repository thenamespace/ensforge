import { Duration, Effect, Array as Arr } from "effect";

import { WaitForCallsStatusTimeoutError, type Hex } from "viem";
import {
  estimateGas,
  getBlock,
  getCallsStatus,
  getCapabilities,
  sendCalls,
  sendTransaction,
  waitForCallsStatus,
} from "viem/actions";

import type { Client } from "../../client/types.js";
import { TransactionError } from "../../errors/classes/TransactionError.js";
import type { Plan } from "../../plan/Plan.js";
import type { Write } from "../../Types.js";
import { addressOf } from "../address.js";
import { toAnyError } from "../anyError.js";
import { fromPromise } from "../rpc/fromPromise.js";
import { withHeadroom } from "./gas.js";
import { receiptsOf } from "./receipts.js";
import type { Signer } from "./signer.js";

/** Whether the wallet sends atomic EIP-5792 bundles without asking to upgrade the account. */
export const supportsAtomicBatch = (signer: Signer, chainId: number): Effect.Effect<boolean> =>
  fromPromise(() =>
    getCapabilities(signer.walletClient, { account: signer.account, chainId }),
  ).pipe(
    // `ready` means the wallet would first ask the user to upgrade the account (EIP-7702);
    // `auto` does not trigger that prompt, `mode: "batch"` still does.
    Effect.map((capabilities) => capabilities.atomic?.status === "supported"),
    // Wallets without EIP-5792 reject the request; they get sequential transactions.
    Effect.orElseSucceed(() => false),
  );

/**
 * Sends a step's calls as one transaction each, in order. Each waits for the previous one's
 * receipt: a call may depend on the one before (a payment after its approval), and wallets
 * estimate its gas against mined state, so a call sent early can run out of gas or be refused.
 */
export const sendSequential = Effect.fnUntraced(function* (
  client: Client,
  signer: Signer,
  step: Plan.Step,
) {
  const account = addressOf(signer.account);
  const hashes: Hex[] = [];

  for (const call of step.calls) {
    const previous = hashes.at(-1);
    if (previous !== undefined) yield* receiptsOf(client, [previous]);

    const context = { contract: call.to, account, chainId: client.chain.id };
    const estimate = yield* fromPromise(
      () =>
        estimateGas(client.publicClient, {
          account,
          to: call.to,
          data: call.data,
          value: call.value,
        }),
      context,
    );
    const hash = yield* fromPromise(
      () =>
        sendTransaction(signer.walletClient, {
          account: signer.account,
          chain: signer.walletClient.chain ?? null,
          to: call.to,
          data: call.data,
          value: call.value,
          gas: withHeadroom(estimate),
        }),
      context,
    );
    hashes.push(hash);
  }
  return hashes;
});

/**
 * Sends a step as one EIP-5792 bundle and waits for it to settle. A bundle has no transaction
 * hash until it is included, so this waits for its receipts. Some wallets report success before
 * the receipts exist, so a bundle only counts as settled with receipts or a final status.
 */
export const sendBatch = Effect.fnUntraced(function* (
  client: Client,
  signer: Signer,
  step: Plan.Step,
  timeout: number | undefined,
  paymaster?: Write.Options["paymaster"],
) {
  const context = { account: addressOf(signer.account), chainId: client.chain.id };
  const { id } = yield* fromPromise(
    () =>
      sendCalls(signer.walletClient, {
        account: signer.account,
        ...(signer.walletClient.chain === undefined ? {} : { chain: signer.walletClient.chain }),
        calls: Arr.map(step.calls, (call) => ({ to: call.to, data: call.data, value: call.value })),
        forceAtomic: true,
        ...(paymaster === undefined
          ? {}
          : {
              capabilities: {
                paymasterService: {
                  url: paymaster.url,
                  ...(paymaster.context === undefined ? {} : { context: paymaster.context }),
                },
              },
            }),
      }),
    context,
  );

  const result = yield* Effect.tryPromise({
    try: () =>
      waitForCallsStatus(signer.walletClient, {
        id,
        // Without a `timeout`, five minutes: a bundle has no hash to check on later.
        timeout: timeout ?? 300_000,
        status: ({ statusCode, receipts }) =>
          statusCode >= 300 || (statusCode >= 200 && (receipts?.length ?? 0) > 0),
      }),
    catch: (cause) =>
      cause instanceof WaitForCallsStatusTimeoutError
        ? new TransactionError({ code: "RECEIPT_TIMEOUT", bundleId: id, cause })
        : toAnyError(cause, context),
  });

  const hashes = Arr.map(result.receipts ?? [], (receipt) => receipt.transactionHash);
  // `failure` is a revert even when the transaction carrying the bundle succeeded (ERC-4337).
  if (result.status !== "success" || hashes.length === 0) {
    return yield* Effect.fail(
      new TransactionError({ code: "TRANSACTION_REVERTED", bundleId: id, hash: hashes.at(-1) }),
    );
  }
  return { id, hashes };
});

/** Waits until the latest block's timestamp reaches `timestamp` (chain time, not wall time). */
export const waitForChainTime = Effect.fnUntraced(function* (client: Client, timestamp: bigint) {
  for (;;) {
    const block = yield* fromPromise(() => getBlock(client.publicClient, { blockTag: "latest" }));
    if (block.timestamp >= timestamp) return;
    // Chain time can run ahead of wall time (devnets, forks), so check again at least every
    // polling interval instead of sleeping the whole difference.
    const remaining = Duration.seconds(Math.max(1, Number(timestamp - block.timestamp)));
    yield* Effect.sleep(
      Duration.min(remaining, Duration.millis(client.publicClient.pollingInterval)),
    );
  }
});

/**
 * What became of a bundle sent before (resuming): its transactions once it landed, `pending`, or
 * `failed` (reverted or unknown to the wallet), in which case its steps are sent again.
 */
export const bundleOutcome = (
  signer: Signer,
  id: string,
): Effect.Effect<readonly Hex[] | "pending" | "failed"> =>
  fromPromise(() => getCallsStatus(signer.walletClient, { id })).pipe(
    Effect.map((status) => {
      const hashes = Arr.map(status.receipts ?? [], (receipt) => receipt.transactionHash);
      if (status.status === "success" && hashes.length > 0) return hashes;
      return status.status === "pending" ? ("pending" as const) : ("failed" as const);
    }),
    Effect.orElseSucceed(() => "failed" as const),
  );
