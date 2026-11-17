import { Effect } from "effect";

import { isAddressEqual, isHash } from "viem";
import { getTransaction } from "viem/actions";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import * as Action from "../../../internal/action/index.js";
import { requireRecord } from "../../../internal/plan/records.js";
import { fromPromise } from "../../../internal/rpc/fromPromise.js";
import type { reconcile as Promises } from "./index.js";

const invalid = (field: string, input: unknown, shortMessage: string) =>
  new InvalidInputError({ code: "INVALID_RECORD_VALUE", field, input, shortMessage });

/** @internal Implementation of `Actions.plan.reconcile`. */
export const reconcile = Effect.fn("ensforge.plan.reconcile")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  if (!isHash(options.hash)) {
    return yield* Effect.fail(invalid("hash", options.hash, "The hash must be 32 bytes."));
  }
  const record = yield* requireRecord(client, options.id);
  const step = record.plan.steps.find((candidate) => candidate.id === options.step);
  if (step === undefined) {
    return yield* Effect.fail(
      invalid("step", options.step, `The plan has no step ${options.step}.`),
    );
  }

  // The transaction must exist and come from the plan's account, or call one of the step's
  // contracts (a smart account or bundle can send from elsewhere).
  const transaction = yield* fromPromise(() =>
    getTransaction(client.publicClient, { hash: options.hash }),
  );
  const plausible =
    (record.plan.account !== undefined && isAddressEqual(transaction.from, record.plan.account)) ||
    (transaction.to !== null &&
      step.calls.some((call) => isAddressEqual(call.to, transaction.to as `0x${string}`)));
  if (!plausible) {
    return yield* Effect.fail(
      invalid(
        "hash",
        options.hash,
        "The transaction is not from the plan's account or to the step's contracts.",
      ),
    );
  }

  const updated = {
    ...record,
    submitted: { ...record.submitted, [step.id]: [options.hash] },
    updatedAt: Date.now(),
  };
  yield* fromPromise(() => client.config.storage.set(updated));
  return updated;
}, Action.withContext("plan.reconcile"));
