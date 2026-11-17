import { Effect } from "effect";

import type { Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { randomSalt } from "../../../internal/factory/verifiable-proxy.js";
import { loadName } from "../../../internal/name/load.js";
import { parseName } from "../../../internal/name/normalize.js";
import { setResolverCall } from "../../../internal/name/set-resolver.js";
import { requireAddress, requireRegistered } from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import { deployPermissionedResolver } from "../../../internal/resolver/deploy.js";
import { roleBitmapOf } from "../../../internal/role/bitmap.js";
import { addressOf } from "../../../internal/write/signer.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { create as Promises } from "./index.js";

/** The extra grants, validated; the owner's grant is added by `deployPermissionedResolver`. */
const grantsOf = Effect.fnUntraced(function* (
  grants: Promises.Options["grants"],
): Effect.fn.Return<{ account: Address; roleBitmap: bigint }[], AnyError> {
  const extra = yield* Effect.forEach(grants ?? [], (grant) =>
    Effect.gen(function* () {
      const account = yield* requireAddress(grant.account, "grants.account");
      const roleBitmap = yield* roleBitmapOf(grant.roles);
      return { account, roleBitmap };
    }),
  );
  return extra;
});

/** @internal Builds the plan of `Actions.resolver.create`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const v2 = client.deployment.v2;
  if (v2 === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: "PermissionedResolver" }),
    );
  }
  // CREATE2 addresses depend on the sender, so the account must be known up front.
  const deployer = addressOf(options.account) ?? client.account;
  if (deployer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }
  if (options.records !== undefined && options.name === undefined) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "records",
        input: "records without name",
        shortMessage: "Initial records need the `name` they belong to.",
      }),
    );
  }

  const owner =
    options.owner === undefined ? deployer : yield* requireAddress(options.owner, "owner");
  const grants = yield* grantsOf(options.grants);
  const parts = options.name === undefined ? undefined : yield* parseName(options.name);
  const deployment = yield* deployPermissionedResolver(client, {
    deployer,
    owner,
    salt: options.salt ?? randomSalt(),
    grants,
    name: parts,
    records: options.records,
  });
  const steps: Plan.Step[] = [
    { id: "deploy", description: "Create resolver", calls: [deployment.call] },
  ];

  if (parts !== undefined) {
    const loaded = yield* loadName(client, parts.name);
    yield* requireRegistered(loaded);
    steps.push({
      id: "resolver",
      description: "Set resolver",
      calls: [yield* setResolverCall(client, loaded, deployment.address)],
    });
  }

  return makePlan({
    operation: "resolver.create",
    chainId: client.chain.id,
    account: deployer,
    steps,
    deploys: [{ contract: "resolver", address: deployment.address }],
  });
});

// Pointing a name at the new resolver is the step a contract may refuse without saying why.
const pointsName = explainFor(
  (options: Promises.Options) => options.name ?? "",
  () => ["setResolver" as const],
);

const write = Action.write(
  "resolver.create",
  plan,
  { contractKind: "resolver" },
  (client, options, account) =>
    options.name === undefined ? Effect.undefined : pointsName(client, options, account),
);

const withResolver = <result extends Write.Result>(result: result) => ({
  ...result,
  resolver: (result.plan.deploys[0] as Plan.Deployment).address,
});

/** @internal Implementation of `Actions.resolver.create`. */
export const create = (
  client: Client,
  options: Promises.Options & Write.Options,
): Effect.Effect<Promises.ReturnType, AnyError> =>
  write.send(client, options).pipe(Effect.map(withResolver));

/** @internal Implementation of `Actions.resolver.createSync`. */
export const createSync = (
  client: Client,
  options: Promises.Options & Write.SyncOptions,
): Effect.Effect<Write.SyncResult & { readonly resolver: Address }, AnyError> =>
  write.sendSync(client, options).pipe(Effect.map(withResolver));

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.resolver.create`. */
export const createMethods = write.methods;
