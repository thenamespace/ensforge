import { Effect } from "effect";

import type { Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { setterKeying } from "../../../internal/records/setter-keying.js";
import { encodeRecordWrites, resolverCall } from "../../../internal/records/write-profiles.js";
import { randomSecret } from "../../../internal/registration/commitment.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { registeredNames } from "../../../internal/registration/events.js";
import { paymentCalls } from "../../../internal/registration/payment.js";
import {
  prepareRegistration,
  type PreparedRegistration,
} from "../../../internal/registration/prepare.js";
import {
  commitCall,
  pendingCommitments,
  registerCall,
} from "../../../internal/registration/steps.js";
import { ethPrimaryNameCall } from "../../../internal/reverse/calls.js";
import { addressOf } from "../../../internal/write/signer.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { register as Promises, registerSync as SyncPromises } from "./index.js";

/** Records for names that use a resolver the caller passed: written after registration. */
const recordsStep = Effect.fnUntraced(function* (
  client: Client,
  registration: PreparedRegistration,
  resolver: Address,
): Effect.fn.Return<Plan.Step, AnyError> {
  const keying = yield* setterKeying(client, resolver);
  const calls = yield* Effect.try({
    try: () =>
      registration.names.map((name) =>
        resolverCall(resolver, encodeRecordWrites(keying, name, registration.records ?? {})),
      ),
    catch: (error) => error as AnyError,
  });
  return { id: "records", description: "Set records", calls };
});

/** @internal Builds the plan of `Actions.registration.register`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  // The signer pays, and resolvers it deploys get CREATE2 addresses from its address.
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  const registration = yield* prepareRegistration(client, options, signer);
  const toCommit = yield* pendingCommitments(registration);
  const approvals = yield* paymentCalls(client, {
    payer: signer,
    token: registration.token,
    spender: registration.contracts.registrar,
    amount: registration.total,
  });

  const steps: Plan.Step[] = [];
  if (approvals.length > 0) {
    steps.push({ id: "approve", description: "Approve payment", calls: approvals });
  }
  if (toCommit.length > 0) {
    steps.push({
      id: "commit",
      description: "Commit to the names",
      calls: toCommit.map((name) => commitCall(registration, name)),
    });
  }
  // The registrar accepts a commitment `MIN_COMMITMENT_AGE` after the block that recorded it;
  // one extra second keeps `register` out of the boundary block.
  steps.push({
    id: "register",
    description: "Register",
    calls: registration.names.flatMap((name) => [
      ...(name.deploy === undefined ? [] : [name.deploy]),
      registerCall(registration, name),
    ]),
    ...(toCommit.length > 0 ? { waitFor: { seconds: registration.minCommitmentAge + 1n } } : {}),
  });
  if (registration.explicitResolver !== undefined && registration.records !== undefined) {
    steps.push(yield* recordsStep(client, registration, registration.explicitResolver));
  }
  // `prepareRegistration` allows a primary name only for exactly one name owned by the signer.
  const [first] = registration.names;
  if (options.primaryName === true && first !== undefined) {
    steps.push({
      id: "primaryName",
      description: "Set primary name",
      calls: [yield* ethPrimaryNameCall(client, signer, true, first.name)],
    });
  }

  return makePlan({
    operation: "registration.register",
    chainId: client.chain.id,
    account: signer,
    steps,
    requirements: [{ kind: "balance", amount: registration.total, token: registration.token }],
    deploys: registration.names.flatMap((name) =>
      name.deploy === undefined ? [] : [{ contract: "resolver" as const, address: name.resolver }],
    ),
  });
});

const write = Action.write("registration.register", plan, { contractKind: "registrar" });

/** @internal Implementation of `Actions.registration.register`. */
export const register = (
  client: Client,
  options: Promises.Options & Write.Options,
): Effect.Effect<Promises.ReturnType, AnyError> => {
  // Created here, not in the planner, so the caller gets it back to resume the registration.
  const secret = options.secret ?? randomSecret();
  return write
    .send(client, { ...options, secret })
    .pipe(Effect.map((result) => ({ ...result, secret })));
};

/** @internal Implementation of `Actions.registration.registerSync`. */
export const registerSync = (
  client: Client,
  options: SyncPromises.Options,
): Effect.Effect<SyncPromises.ReturnType, AnyError> => {
  const secret = options.secret ?? randomSecret();
  return write.sendSync(client, { ...options, secret }).pipe(
    Effect.flatMap(
      Effect.fnUntraced(function* (result) {
        const contracts = yield* requireRegistrationContracts(client);
        const registered = yield* registeredNames(client, {
          receipts: result.receipts,
          registrar: contracts.registrar,
          ethRegistry: contracts.ethRegistry,
        });
        return { ...result, ...registered, secret };
      }),
    ),
  );
};

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.registration.register`. */
export const registerMethods = write.methods;
