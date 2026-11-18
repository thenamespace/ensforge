import { Clock, Effect } from "effect";

import { isHash } from "viem";
import { getTransaction } from "viem/actions";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import * as Action from "../../../internal/action/index.js";
import { sameAddress } from "../../../internal/address.js";
import { requireRecord } from "../../../internal/plan/records.js";
import { fromPromise } from "../../../internal/rpc/fromPromise.js";
import { chainClient, hasChain } from "../../../internal/write/chain.js";
import type { reconcile as Promises } from "./index.js";

/** @internal Implementation of `Actions.plan.reconcile`. */
export const reconcile = Effect.fn("ensforge.plan.reconcile")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  if (!isHash(options.hash)) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "hash",
        input: options.hash,
        shortMessage: "The hash must be 32 bytes.",
      }),
    );
  }
  const record = yield* requireRecord(client, options.id);
  const step = record.plan.steps.find((candidate) => candidate.id === options.step);
  if (step === undefined) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "step",
        input: options.step,
        shortMessage: `The plan has no step ${options.step}.`,
      }),
    );
  }

  // The transaction must exist and come from the plan's account, or call one of the step's
  // contracts (a smart account or bundle can send from elsewhere).
  const { chainId } = record.plan;
  const target = hasChain(client, chainId) ? yield* chainClient(client, chainId) : client;
  const transaction = yield* fromPromise(() =>
    getTransaction(target.publicClient, { hash: options.hash }),
  );
  const plausible =
    sameAddress(record.plan.account, transaction.from) ||
    step.calls.some((call) => sameAddress(transaction.to, call.to));
  if (!plausible) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "hash",
        input: options.hash,
        shortMessage: "The transaction is not from the plan's account or to the step's contracts.",
      }),
    );
  }

  const updated = {
    ...record,
    submitted: { ...record.submitted, [step.id]: [options.hash] },
    updatedAt: yield* Clock.currentTimeMillis,
  };
  yield* fromPromise(() => client.config.storage.set(updated));
  return updated;
}, Action.withContext("plan.reconcile"));
