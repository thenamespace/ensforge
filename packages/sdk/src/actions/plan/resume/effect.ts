import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireRecord, requireSendable } from "../../../internal/plan/records.js";
import { waitForReceipts } from "../../../internal/write/receipts.js";
import { sendPlan } from "../../../internal/write/send.js";
import { addressOf, resolveSigner } from "../../../internal/write/signer.js";
import type { Write } from "../../../Types.js";
import type { resume as Promises } from "./index.js";

const resumed = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Write.SyncOptions & { readonly confirmLast?: boolean },
): Effect.fn.Return<Write.Result, AnyError> {
  const record = yield* requireRecord(client, options.id);
  // The client's signer (a local account signs itself); the plan's account only checks it.
  const signer = yield* resolveSigner(client, options.account);
  yield* requireSendable(client, record.plan, addressOf(signer.account));
  return yield* sendPlan(client, record.plan, signer, options, record);
});

/** @internal Implementation of `Actions.plan.resume`. */
export const resume = Effect.fn("ensforge.plan.resume")(function* (
  client: Client,
  options: Promises.Options & Write.Options,
): Effect.fn.Return<Write.Result, AnyError> {
  return yield* resumed(client, options);
}, Action.withContext("plan.resume"));

/** @internal Implementation of `Actions.plan.resumeSync`. */
export const resumeSync = Effect.fn("ensforge.plan.resumeSync")(function* (
  client: Client,
  options: Promises.Options & Write.SyncOptions,
): Effect.fn.Return<Write.SyncResult, AnyError> {
  return yield* waitForReceipts(
    client,
    yield* resumed(client, { ...options, confirmLast: true }),
    options,
  );
}, Action.withContext("plan.resumeSync"));
