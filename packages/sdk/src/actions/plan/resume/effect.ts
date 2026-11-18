import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { requireRecord, requireSendable } from "../../../internal/plan/records.js";
import { chainClient, hasChain } from "../../../internal/write/chain.js";
import { waitForReceipts } from "../../../internal/write/receipts.js";
import { sendPlan } from "../../../internal/write/send.js";
import { resolveSigner } from "../../../internal/write/signer.js";
import type { Write } from "../../../Types.js";
import type { resume as Promises } from "./index.js";

// A plan for another chain (an L2 primary name) resumes on that chain's clients from `chains`.
const resumed = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Write.SyncOptions & { readonly confirmLast?: boolean },
): Effect.fn.Return<{ readonly result: Write.Result; readonly target: Client }, AnyError> {
  const record = yield* requireRecord(client, options.id);
  const { chainId } = record.plan;
  // A plan for a chain the client lacks fails `requireSendable` below.
  const target = hasChain(client, chainId) ? yield* chainClient(client, chainId) : client;
  // The client's signer (a local account signs itself); the plan's account only checks it.
  const signer = yield* resolveSigner(target, options.account);
  yield* requireSendable(client, record.plan, addressOf(signer.account));
  return { result: yield* sendPlan(target, record.plan, signer, options, record), target };
});

/** @internal Implementation of `Actions.plan.resume`. */
export const resume = Effect.fn("ensforge.plan.resume")(function* (
  client: Client,
  options: Promises.Options & Write.Options,
): Effect.fn.Return<Write.Result, AnyError> {
  return (yield* resumed(client, options)).result;
}, Action.withContext("plan.resume"));

/** @internal Implementation of `Actions.plan.resumeSync`. */
export const resumeSync = Effect.fn("ensforge.plan.resumeSync")(function* (
  client: Client,
  options: Promises.Options & Write.SyncOptions,
): Effect.fn.Return<Write.SyncResult, AnyError> {
  const { result, target } = yield* resumed(client, { ...options, confirmLast: true });
  return yield* waitForReceipts(target, result, options);
}, Action.withContext("plan.resumeSync"));
