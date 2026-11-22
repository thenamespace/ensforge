import { Effect, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionData, type Hex } from "viem";

import type { Client } from "../../../client/types.js";
import { CommitmentError } from "../../../errors/classes/CommitmentError.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { randomSecret } from "../../../internal/registration/commitment.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { prepareRegistration } from "../../../internal/registration/prepare.js";
import { commitCall, pendingCommitments } from "../../../internal/registration/steps.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { routeSender } from "../../../internal/write/via.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { commit as Promises, commitSync as SyncPromises } from "./index.js";

/** @internal Builds the plan of `Actions.registration.commit`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account" | "via">,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  // Resolver addresses in the commitment come from the account that will send `register`.
  const sender = (yield* routeSender(client, options.via, signer)) ?? signer;
  const registration = yield* prepareRegistration(client, options, signer, sender);
  const { toCommit, warnings } = pendingCommitments(registration);
  if (toCommit.length === 0) {
    return yield* Effect.fail(
      new CommitmentError({
        code: "COMMITMENT_EXISTS",
        hint: "Register now with the same options and secret.",
      }),
    );
  }

  return makePlan({
    operation: "registration.commit",
    chainId: client.chain.id,
    account: signer,
    steps: [
      {
        id: "commit",
        description: "Commit to the names",
        calls: Arr.map(toCommit, (name) => commitCall(registration, name)),
      },
    ],
    warnings: [...registration.warnings, ...warnings],
  });
});

const write = Action.write("registration.commit", plan, { contractKind: "registrar" });

/** The commitments a commit plan sends, in order. */
const commitmentsOf = (commitPlan: Plan): readonly Hex[] =>
  Arr.map(
    commitPlan.calls,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a commit call's first argument is the commitment
    (call) => decodeFunctionData({ abi: Abis.v2.ethRegistrar, data: call.data }).args?.[0] as Hex,
  );

/** @internal Implementation of `Actions.registration.commit`. */
export const commit = (
  client: Client,
  options: Promises.Options & Write.Options,
): Effect.Effect<Promises.ReturnType, AnyError> => {
  const secret = options.secret ?? randomSecret();
  return write
    .send(client, { ...options, secret })
    .pipe(Effect.map((result) => ({ ...result, secret, commitments: commitmentsOf(result.plan) })));
};

/** @internal Implementation of `Actions.registration.commitSync`. */
export const commitSync = (
  client: Client,
  options: SyncPromises.Options,
): Effect.Effect<SyncPromises.ReturnType, AnyError> => {
  const secret = options.secret ?? randomSecret();
  return write.sendSync(client, { ...options, secret }).pipe(
    Effect.flatMap(
      Effect.fnUntraced(function* (result) {
        const contracts = yield* requireRegistrationContracts(client);
        const commitments = commitmentsOf(result.plan);
        const registrar = { address: contracts.registrar, abi: Abis.v2.ethRegistrar } as const;
        const { committedAt, minAge } = yield* Effect.all(
          {
            committedAt: Rpc.readContract(client, {
              ...registrar,
              functionName: "commitmentAt",
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the collection is known to be non-empty or the index in range here; `noUncheckedIndexedAccess` cannot see it
              args: [commitments[0] as Hex],
            }),
            minAge: Rpc.readContract(client, { ...registrar, functionName: "MIN_COMMITMENT_AGE" }),
          },
          { concurrency: "unbounded" },
        );
        return { ...result, secret, commitments, readyAt: committedAt + minAge };
      }),
    ),
  );
};

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.registration.commit`. */
export const commitMethods = write.methods;
