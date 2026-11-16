import { Effect } from "effect";

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
 * Every Effect a write action exposes, built from one planner: `send` (the action itself),
 * `sendSync` (its `…Sync` sibling) and `methods` (`.prepare`, `.simulate`, `.estimateGas`).
 * Each gets one span and the action's error context.
 */
export const write = <options, error extends EnsforgeError>(
  path: string,
  planner: Planner<options, error>,
  extra?: EnsforgeError.Context,
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
      return yield* simulatePlan(client, plan, addressOf(options.account) ?? client.account);
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
      return yield* sendPlan(client, plan, signer, options);
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
      const result = yield* sendPlan(client, plan, signer, options);
      return yield* waitForReceipts(client, result, options);
    },
    withContext(`${path}Sync`, extra),
  );

  return { send, sendSync, methods: { prepare, simulate, estimateGas } };
};
