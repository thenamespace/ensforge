import { Effect } from "effect";

import { standaloneSingleOwnerHcaV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import type { Errors, Plan, Write } from "@ensforge/core";
import { Action, type Client } from "@ensforge/core/extension";
import { encodeFunctionData } from "viem";

import { HcaError } from "../../../errors/classes/HcaError.js";
import { readAccount } from "../../../internal/account.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { revokeSessions as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hca.revokeSessions`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const owner = yield* signerOf(client, options.account);
  const account = yield* readAccount(client, { owner });
  if (!account.deployed) {
    return yield* Effect.fail(
      new HcaError({
        code: "HCA_NOT_VERIFIED",
        shortMessage: "The HCA is not deployed; it has no sessions.",
      }),
    );
  }
  return onePlan(client, {
    operation: "hca.revokeSessions",
    account: owner,
    description: "Revoke HCA sessions",
    calls: [
      {
        to: account.address,
        data: encodeFunctionData({
          abi: standaloneSingleOwnerHcaV2Abi,
          functionName: "revokeSessions",
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("hca.revokeSessions", plan);

/** @internal Implementation of `Actions.hca.revokeSessions`. */
export const revokeSessions = write.send;

/** @internal Implementation of `Actions.hca.revokeSessionsSync`. */
export const revokeSessionsSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hca.revokeSessions`. */
export const revokeSessionsMethods = write.methods;
