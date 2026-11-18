import { Effect } from "effect";

import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import type { EnsforgeError } from "../../errors/EnsforgeError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import type { Write } from "../../Types.js";
import { addressOf } from "../address.js";
import { chainClient } from "../write/chain.js";
import { offchainWriteRefusal } from "../write/offchain.js";
import { waitForReceipts } from "../write/receipts.js";
import { sendPlan } from "../write/send.js";
import { resolveSigner } from "../write/signer.js";
import { estimatePlan, simulatePlan } from "../write/simulate.js";
import { staleTransfer } from "../write/stale.js";
import { routePlan } from "../write/via.js";
import { contextOf, withContext } from "./context.js";

/**
 * Builds the plan of a write action from its options.
 *
 * @stability unstable
 */
export type Planner<options, error> = (
  client: Client,
  options: options & Pick<Write.Options, "account">,
) => Effect.Effect<Plan, error>;

/**
 * Explains why the write reverted: the name expiring before the transaction can be mined, or what
 * the signer is missing for a revert that carries no error name (ENSv1 `require` strings); else
 * `undefined`. Only consulted when simulation reverts, so successful writes pay nothing for it.
 */
export type Explainer<options> = (
  client: Client,
  options: options,
  account: Address,
  error: AnyError,
) => Effect.Effect<AnyError | undefined, AnyError>;

// An unmapped `require` string decodes as `Error(string)`: it names no ENS error either.
export const isOpaqueRevert = (error: AnyError): boolean =>
  error._tag === "ContractRevertError" &&
  (error.context.revert?.errorName === undefined || error.context.revert.errorName === "Error");

/**
 * Refines a failed write: a stale prepared transfer becomes `PLAN_STALE`, a resolver's refusal to
 * store records on-chain its typed error, and any other opaque revert the explainer's error,
 * keeping the revert as the cause.
 */
const explained = <options>(
  client: Client,
  options: options,
  account: Address | undefined,
  explain: Explainer<options> | undefined,
  extra: EnsforgeError.Context | undefined,
  plan: Plan,
  error: AnyError,
): Effect.Effect<AnyError> =>
  Effect.gen(function* () {
    const refined =
      (yield* staleTransfer(client, plan, error)) ??
      (extra?.contractKind === "resolver" ? yield* offchainWriteRefusal(client, error) : undefined);
    if (refined !== undefined) return refined;
    if (explain === undefined || account === undefined || error.context.revert === undefined) {
      return error;
    }
    return yield* explain(client, options, account, error).pipe(
      Effect.map((explanation) =>
        explanation === undefined ? error : (explanation.withCause(error) as AnyError),
      ),
      // A failing explanation must not hide the original error.
      Effect.orElseSucceed(() => error),
    );
  });

/**
 * Every Effect a write action exposes, built from one planner: `send` (the action itself),
 * `sendSync` (its `…Sync` sibling) and `methods` (`.prepare`, `.simulate`, `.estimateGas`).
 * Each gets one span and the action's error context.
 *
 * @stability unstable
 */
export const write = <options, error extends EnsforgeError>(
  path: string,
  planner: Planner<options, error>,
  extra?: EnsforgeError.Context,
  explain?: Explainer<options>,
) => {
  // The plan as the route (`via`) will send it (without a route, as planned), and the client of
  // the chain it runs on.
  const planned = Effect.fnUntraced(function* (
    client: Client,
    options: options & Pick<Write.Options, "account" | "via">,
  ): Effect.fn.Return<{ readonly plan: Plan; readonly target: Client }, error | AnyError> {
    const plan = yield* planner(client, options);
    const target = yield* chainClient(client, plan.chainId);
    return {
      plan: yield* routePlan(
        target,
        plan,
        options.via,
        addressOf(options.account) ?? client.account,
      ),
      target,
    };
  });

  const prepare = Effect.fn(`ensforge.${path}.prepare`)(
    function* (
      client: Client,
      options: options & Pick<Write.Options, "account" | "via">,
    ): Effect.fn.Return<Plan, error | AnyError> {
      return (yield* planned(client, options)).plan;
    },
    withContext(`${path}.prepare`, extra),
  );

  const simulate = Effect.fn(`ensforge.${path}.simulate`)(
    function* (
      client: Client,
      options: options & Pick<Write.Options, "account" | "via">,
    ): Effect.fn.Return<Plan.Simulation, error | AnyError> {
      const { plan, target } = yield* planned(client, options);
      const account = addressOf(options.account) ?? client.account;
      const simulation = yield* simulatePlan(target, plan, account);
      // Step errors are values, not failures, so they get the action's context here.
      const context = contextOf(`${path}.simulate`, client, options, extra);
      const steps = yield* Effect.forEach(simulation.steps, (step) =>
        step.error === undefined
          ? Effect.succeed(step)
          : explained(client, options, account, explain, extra, plan, step.error).pipe(
              Effect.map((error) => ({ ...step, error: error.withContext(context) })),
            ),
      );
      return { ...simulation, steps };
    },
    withContext(`${path}.simulate`, extra),
  );

  const estimateGas = Effect.fn(`ensforge.${path}.estimateGas`)(
    function* (
      client: Client,
      options: options & Pick<Write.Options, "account" | "via">,
    ): Effect.fn.Return<Plan.Estimate, error | AnyError> {
      const { plan, target } = yield* planned(client, options);
      return yield* estimatePlan(target, plan, addressOf(options.account) ?? client.account);
    },
    withContext(`${path}.estimateGas`, extra),
  );

  // Shared by `send` and `sendSync`: an opaque revert becomes the explainer's error. `sendSync`
  // waits for the receipts on the plan's chain.
  const sendPlanned = Effect.fnUntraced(function* (
    client: Client,
    options: options & Write.SyncOptions,
    confirmLast: boolean,
  ): Effect.fn.Return<Write.Result | Write.SyncResult, error | AnyError> {
    const { plan, target } = yield* planned(client, options);
    const signer = yield* resolveSigner(target, options.account);
    const result = yield* sendPlan(target, plan, signer, { ...options, confirmLast }).pipe(
      Effect.catch((error: AnyError) =>
        explained(client, options, addressOf(signer.account), explain, extra, plan, error).pipe(
          Effect.flatMap(Effect.fail),
        ),
      ),
    );
    return confirmLast ? yield* waitForReceipts(target, result, options) : result;
  });

  const send = Effect.fn(`ensforge.${path}`)(
    function* (
      client: Client,
      options: options & Write.Options,
    ): Effect.fn.Return<Write.Result, error | AnyError> {
      return yield* sendPlanned(client, options, false);
    },
    withContext(path, extra),
  );

  const sendSync = Effect.fn(`ensforge.${path}Sync`)(
    function* (
      client: Client,
      options: options & Write.SyncOptions,
    ): Effect.fn.Return<Write.SyncResult, error | AnyError> {
      return (yield* sendPlanned(client, options, true)) as Write.SyncResult;
    },
    withContext(`${path}Sync`, extra),
  );

  // Paths name each Effect for cache keys (e.g. React's), alongside the Promise actions' own.
  return {
    send,
    sendSync,
    methods: {
      prepare: Object.assign(prepare, { path: `${path}.prepare` }),
      simulate: Object.assign(simulate, { path: `${path}.simulate` }),
      estimateGas: Object.assign(estimateGas, { path: `${path}.estimateGas` }),
    },
  };
};
