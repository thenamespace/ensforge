import { Effect } from "effect";

import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import type { EnsforgeError } from "../../errors/EnsforgeError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import type { Write } from "../../Types.js";
import { waitForReceipts } from "../write/receipts.js";
import { sendPlan } from "../write/send.js";
import { addressOf, resolveSigner } from "../write/signer.js";
import { estimatePlan, simulatePlan } from "../write/simulate.js";
import { withContext } from "./context.js";

/** Builds the plan of a write action from its options. */
export type Planner<options, error> = (
  client: Client,
  options: options & Pick<Write.Options, "account">,
) => Effect.Effect<Plan, error>;

/**
 * Explains why the signer could not perform the write: an `UnauthorizedError` with what is
 * missing, or `undefined`. Only consulted when simulation fails with a revert that carries no
 * error name (ENSv1 `require` strings), so successful writes pay nothing for it.
 */
export type Explainer<options> = (
  client: Client,
  options: options,
  account: Address,
) => Effect.Effect<AnyError | undefined, AnyError>;

const isOpaqueRevert = (error: AnyError): boolean =>
  error._tag === "ContractRevertError" && error.context.revert?.errorName === undefined;

/** Replaces an opaque revert with the explainer's error, keeping the revert as its cause. */
const explained = <options>(
  client: Client,
  options: options,
  account: Address | undefined,
  explain: Explainer<options> | undefined,
  error: AnyError,
): Effect.Effect<AnyError> =>
  explain === undefined || account === undefined || !isOpaqueRevert(error)
    ? Effect.succeed(error)
    : explain(client, options, account).pipe(
        Effect.map((explanation) =>
          explanation === undefined ? error : (explanation.withCause(error) as AnyError),
        ),
        // A failing explanation must not hide the original error.
        Effect.orElseSucceed(() => error),
      );

/**
 * Every Effect a write action exposes, built from one planner: `send` (the action itself),
 * `sendSync` (its `…Sync` sibling) and `methods` (`.prepare`, `.simulate`, `.estimateGas`).
 * Each gets one span and the action's error context.
 */
export const write = <options, error extends EnsforgeError>(
  path: string,
  planner: Planner<options, error>,
  extra?: EnsforgeError.Context,
  explain?: Explainer<options>,
) => {
  const prepare = Effect.fn(`ensforge.${path}.prepare`)(
    function* (
      client: Client,
      options: options & Pick<Write.Options, "account">,
    ): Effect.fn.Return<Plan, error> {
      return yield* planner(client, options);
    },
    withContext(`${path}.prepare`, extra),
  );

  const simulate = Effect.fn(`ensforge.${path}.simulate`)(
    function* (
      client: Client,
      options: options & Pick<Write.Options, "account">,
    ): Effect.fn.Return<Plan.Simulation, error> {
      const plan = yield* planner(client, options);
      const account = addressOf(options.account) ?? client.account;
      const simulation = yield* simulatePlan(client, plan, account);
      const steps = yield* Effect.forEach(simulation.steps, (step) =>
        step.error === undefined
          ? Effect.succeed(step)
          : explained(client, options, account, explain, step.error).pipe(
              Effect.map((error) => ({ ...step, error })),
            ),
      );
      return { ...simulation, steps };
    },
    withContext(`${path}.simulate`, extra),
  );

  const estimateGas = Effect.fn(`ensforge.${path}.estimateGas`)(
    function* (
      client: Client,
      options: options & Pick<Write.Options, "account">,
    ): Effect.fn.Return<Plan.Estimate, error | AnyError> {
      const plan = yield* planner(client, options);
      return yield* estimatePlan(client, plan, addressOf(options.account) ?? client.account);
    },
    withContext(`${path}.estimateGas`, extra),
  );

  const send = Effect.fn(`ensforge.${path}`)(
    function* (
      client: Client,
      options: options & Write.Options,
    ): Effect.fn.Return<Write.Result, error | AnyError> {
      const plan = yield* planner(client, options);
      const signer = yield* resolveSigner(client, options.account);
      return yield* sendPlan(client, plan, signer, options).pipe(
        Effect.catch((error: AnyError) =>
          explained(client, options, addressOf(signer.account), explain, error).pipe(
            Effect.flatMap(Effect.fail),
          ),
        ),
      );
    },
    withContext(path, extra),
  );

  const sendSync = Effect.fn(`ensforge.${path}Sync`)(
    function* (
      client: Client,
      options: options & Write.SyncOptions,
    ): Effect.fn.Return<Write.SyncResult, error | AnyError> {
      const plan = yield* planner(client, options);
      const signer = yield* resolveSigner(client, options.account);
      const result = yield* sendPlan(client, plan, signer, options).pipe(
        Effect.catch((error: AnyError) =>
          explained(client, options, addressOf(signer.account), explain, error).pipe(
            Effect.flatMap(Effect.fail),
          ),
        ),
      );
      return yield* waitForReceipts(client, result, options);
    },
    withContext(`${path}Sync`, extra),
  );

  return { send, sendSync, methods: { prepare, simulate, estimateGas } };
};
