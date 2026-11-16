import { Effect } from "effect";

import type { Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { planMigration, type Expectation } from "../../../internal/migration/plan.js";
import { verifyMigration } from "../../../internal/migration/verify.js";
import { waitForReceipts } from "../../../internal/write/receipts.js";
import { sendPlan } from "../../../internal/write/send.js";
import { addressOf, resolveSigner } from "../../../internal/write/signer.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import { plan as renewalPlan } from "../../registration/renew/effect.js";
import type { migrate as Promises } from "./index.js";

const planned = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<
  { readonly plan: Plan; readonly expectations: readonly Expectation[] },
  AnyError
> {
  const signer: Address | undefined = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  const migration = yield* planMigration(
    client,
    { ...options, renewing: options.renew !== undefined },
    signer,
  );
  // Names in grace renew first; their tokens can only move once they are registered again.
  const renewal =
    options.renew !== undefined && migration.expired.length > 0
      ? yield* renewalPlan(client, {
          names: migration.expired,
          duration: options.renew.duration,
          paymentToken: options.renew.paymentToken,
          account: options.account,
        })
      : undefined;

  return {
    expectations: migration.expectations,
    plan: makePlan({
      operation: "migration.migrate",
      chainId: client.chain.id,
      account: signer,
      steps: [...(renewal?.steps ?? []), ...migration.steps],
      deploys: migration.deploys,
      warnings: [...(renewal?.warnings ?? []), ...migration.warnings],
    }),
  };
});

/** @internal Builds the plan of `Actions.migration.migrate`. */
export const plan = (client: Client, options: Promises.Options & Pick<Write.Options, "account">) =>
  planned(client, options).pipe(Effect.map((result) => result.plan));

const write = Action.write("migration.migrate", plan, { contractKind: "registrar" });

/** @internal Implementation of `Actions.migration.migrate`. */
export const migrate = write.send;

/**
 * @internal Implementation of `Actions.migration.migrateSync`: sends the plan, waits for every
 * receipt, then checks each name's ENSv2 state against the plan.
 */
export const migrateSync = Effect.fn("ensforge.migration.migrateSync")(
  function* (
    client: Client,
    options: Promises.Options & Write.SyncOptions,
  ): Effect.fn.Return<Write.SyncResult, AnyError> {
    const { plan: migration, expectations } = yield* planned(client, options);
    const signer = yield* resolveSigner(client, options.account);
    const result = yield* sendPlan(client, migration, signer, options);
    const receipts = yield* waitForReceipts(client, result, options);

    yield* verifyMigration(client, expectations);
    return receipts;
  },
  Action.withContext("migration.migrateSync", { contractKind: "registrar" }),
);

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.migration.migrate`. */
export const migrateMethods = write.methods;
