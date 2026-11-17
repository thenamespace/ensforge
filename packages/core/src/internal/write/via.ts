import { Effect } from "effect";

import type { Address, Hex } from "viem";

import { stateOf } from "../../client/state.js";
import type { Client } from "../../client/types.js";
import { TransactionError } from "../../errors/classes/TransactionError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import type { Write } from "../../Types.js";
import { fromPromise } from "../rpc/fromPromise.js";

/** What a route sees of the write; the wallet is looked up lazily, as writes do. */
export const viaContext = Effect.fnUntraced(function* (
  client: Client,
  account: Address | undefined,
): Effect.fn.Return<Write.Via.Context, AnyError> {
  const state = stateOf(client);
  const walletClient =
    state === undefined ? undefined : yield* fromPromise(() => state.getWalletClient());
  return {
    chainId: client.chain.id,
    account,
    publicClient: client.publicClient,
    walletClient,
  };
});

/** The account a route runs the calls as, or `undefined` when it is the signer. */
export const routeSender = (
  client: Client,
  via: Write.Via | undefined,
  account: Address | undefined,
): Effect.Effect<Address | undefined, AnyError> => {
  const sender = via?.sender;
  if (sender === undefined) return Effect.succeed(undefined);
  return viaContext(client, account).pipe(
    Effect.flatMap((context) => fromPromise(() => sender(context))),
  );
};

/** The plan rewritten by the route, or as is without one. */
export const routePlan = (
  client: Client,
  plan: Plan,
  via: Write.Via | undefined,
  account: Address | undefined,
): Effect.Effect<Plan, AnyError> => {
  const prepare = via?.prepare;
  if (prepare === undefined) return Effect.succeed(plan);
  return viaContext(client, account).pipe(
    Effect.flatMap((context) => fromPromise(() => prepare(plan, context))),
  );
};

const pollInterval = "2 seconds";

/**
 * Follows a step sent through a route until it is mined. `undefined` when it failed before
 * landing (it can be sent again); a failure with transactions fails the write.
 */
export const routeOutcome = Effect.fnUntraced(function* (
  via: Write.Via,
  context: Write.Via.Context,
  reference: string,
): Effect.fn.Return<readonly Hex[] | undefined, AnyError> {
  const status = via.status;
  if (status === undefined) return undefined;

  for (;;) {
    const outcome = yield* fromPromise(() => status(reference, context));
    if (outcome.status === "success") return outcome.hashes;
    if (outcome.status === "failed") {
      if (outcome.hashes === undefined || outcome.hashes.length === 0) return undefined;
      return yield* Effect.fail(
        new TransactionError({
          code: "TRANSACTION_REVERTED",
          hash: outcome.hashes.at(-1),
          shortMessage: `The ${via.id} execution failed: ${outcome.reason}`,
        }),
      );
    }
    yield* Effect.sleep(pollInterval);
  }
});

/** Sends one step through a route and waits for its transactions. */
export const sendThroughRoute = Effect.fnUntraced(function* (
  via: Write.Via,
  context: Write.Via.Context,
  step: Plan.Step,
  onReference: (reference: string) => Effect.Effect<void>,
): Effect.fn.Return<readonly Hex[], AnyError> {
  const send = via.send as NonNullable<Write.Via["send"]>;
  const reference = yield* fromPromise(() => send(step, context));
  yield* onReference(reference);

  const hashes = yield* routeOutcome(via, context, reference);
  if (hashes === undefined) {
    return yield* Effect.fail(
      new TransactionError({
        code: "TRANSACTION_REVERTED",
        shortMessage: `The ${via.id} execution of "${step.description}" failed before it was mined.`,
      }),
    );
  }
  return hashes;
});
