import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { deployProxy, randomSalt } from "../../../internal/factory/verifiable-proxy.js";
import { loadName } from "../../../internal/name/load.js";
import { parseName } from "../../../internal/name/normalize.js";
import { setResolverCall } from "../../../internal/name/set-resolver.js";
import { requireAddress, requireRegistered } from "../../../internal/name/write.js";
import { encodeRecordWrites } from "../../../internal/records/write-profiles.js";
import { addressOf } from "../../../internal/write/signer.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Role from "../../../utils/Role.js";
import type { create as Promises } from "./index.js";

// The owner gets every resolver role and its admin role, like a fresh ENS app resolver.
const allRoles = Object.values(Role.resolver).reduce((bitmap, role) => bitmap | role, 0n);

/** Grants for `initialize`: the owner first, then the extra grants. */
const grantsOf = Effect.fnUntraced(function* (
  owner: Address,
  grants: Promises.Options["grants"],
): Effect.fn.Return<{ account: Address; roleBitmap: bigint }[], AnyError> {
  const extra = yield* Effect.forEach(grants ?? [], (grant) =>
    Effect.gen(function* () {
      const account = yield* requireAddress(grant.account, "grants.account");
      const roleBitmap = yield* Effect.try({
        try: () => (typeof grant.roles === "bigint" ? grant.roles : Role.from(grant.roles)),
        catch: (error) => error as AnyError,
      });
      return { account, roleBitmap };
    }),
  );
  return [{ account: owner, roleBitmap: allRoles }, ...extra];
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
  const grants = yield* grantsOf(owner, options.grants);
  const parts = options.name === undefined ? undefined : yield* parseName(options.name);
  const records =
    parts === undefined || options.records === undefined
      ? []
      : yield* Effect.try({
          try: () => encodeRecordWrites("name", parts, options.records ?? {}),
          catch: (error) => error as AnyError,
        });

  const deployment = yield* deployProxy(client, {
    factory: v2.contracts.verifiableFactory,
    implementation: v2.implementations.permissionedResolver,
    deployer,
    salt: options.salt ?? randomSalt(),
    data: encodeFunctionData({
      abi: Abis.v2.permissionedResolver,
      functionName: "initialize",
      args: [grants, records],
    }),
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

const write = Action.write("resolver.create", plan, { contractKind: "resolver" });

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
