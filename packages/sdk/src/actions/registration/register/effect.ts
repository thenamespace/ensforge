import { Effect, Array as Arr } from "effect";

import { isAddressEqual } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { recordsCall } from "../../../internal/records/write-call.js";
import { randomSecret } from "../../../internal/registration/commitment.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { registeredNames } from "../../../internal/registration/events.js";
import { paymentCalls } from "../../../internal/registration/payment.js";
import { prepareRegistration } from "../../../internal/registration/prepare.js";
import {
  commitCall,
  pendingCommitments,
  registerCall,
} from "../../../internal/registration/steps.js";
import { ethPrimaryNameCalls } from "../../../internal/reverse/calls.js";
import { routeSender } from "../../../internal/write/via.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { register as Promises, registerSync as SyncPromises } from "./index.js";

/** @internal Builds the plan of `Actions.registration.register`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account" | "via">,
): Effect.fn.Return<Plan, AnyError> {
  // The sender pays, and resolvers it deploys get CREATE2 addresses from its address: the signer,
  // or the account a route (`via`) sends `register` from.
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  const sender = (yield* routeSender(client, options.via, signer)) ?? signer;
  const routed = !isAddressEqual(sender, signer);
  const registration = yield* prepareRegistration(client, options, signer, sender);
  const toCommit = yield* pendingCommitments(registration);
  // The registrar charges the price at `register`, which can drift from the quote (the premium
  // decays, the oracle can change), so the approval leaves 2% headroom; the balance check stays
  // exact.
  const approvals = yield* paymentCalls(client, {
    payer: sender,
    token: registration.token,
    spender: registration.contracts.registrar,
    amount: registration.total + registration.total / 50n,
    balanceRequired: registration.total,
  });

  // The approval rides with the commits, so a batching wallet asks once before the wait.
  const steps: Plan.Step[] = [];
  if (toCommit.length > 0) {
    steps.push({
      id: "commit",
      description: approvals.length > 0 ? "Approve payment and commit" : "Commit to the names",
      calls: [...approvals, ...Arr.map(toCommit, (name) => commitCall(registration, name))],
    });
  } else if (approvals.length > 0) {
    steps.push({ id: "approve", description: "Approve payment", calls: approvals });
  }
  // The signer's shared resolver gets its address from the signer, so the signer deploys it.
  if (routed && registration.ownedDeploy !== undefined) {
    steps.push({
      id: "resolver",
      description: "Deploy resolver",
      calls: [registration.ownedDeploy],
      from: "signer",
    });
  }
  steps.push({
    id: "register",
    description: "Register",
    calls: [
      ...(registration.ownedDeploy === undefined || routed ? [] : [registration.ownedDeploy]),
      ...Arr.flatMap(registration.names, (name) => [
        ...(name.deploy === undefined ? [] : [name.deploy]),
        registerCall(registration, name),
      ]),
    ],
    // The registrar accepts a commitment `MIN_COMMITMENT_AGE` after the block that recorded it;
    // one extra second keeps `register` out of the boundary block.
    ...(toCommit.length > 0 ? { waitFor: { seconds: registration.minCommitmentAge + 1n } } : {}),
  });
  // Records on the owner's resolver and the owner's reverse record are the signer's to write.
  const { explicitResolver, records } = registration;
  if (explicitResolver !== undefined && records !== undefined) {
    // A shared resolver deployed in this plan is a PermissionedResolver that does not exist yet.
    const keying = registration.ownedDeploy === undefined ? undefined : ("name" as const);
    steps.push({
      id: "records",
      description: "Set records",
      calls: yield* Effect.forEach(
        registration.names,
        (name) => recordsCall(client, explicitResolver, name, records, keying),
        { concurrency: 1 },
      ),
      ...(routed ? { from: "signer" as const } : {}),
    });
  }
  // `prepareRegistration` allows a primary name only for exactly one name owned by the signer.
  const [first] = registration.names;
  if (options.primaryName === true && first !== undefined) {
    steps.push({
      id: "primaryName",
      description: "Set primary name",
      calls: yield* ethPrimaryNameCalls(client, signer, signer, first.name),
      ...(routed ? { from: "signer" as const } : {}),
    });
  }

  return makePlan({
    operation: "registration.register",
    chainId: client.chain.id,
    account: signer,
    steps,
    requirements: [{ kind: "balance", amount: registration.total, token: registration.token }],
    deploys: Arr.flatMap(registration.names, (name) =>
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
