import { Effect } from "effect";

import { standaloneSingleOwnerHcaV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import type { Errors, Plan, Write } from "@ensforge/sdk";
import { requireAddress } from "@ensforge/sdk/extension";
import { Action, type Client } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { readAccount } from "../../../internal/account.js";
import { executeByOwnerCall } from "../../../internal/calls.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { withdrawDeposit as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hca.withdrawDeposit`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const to = yield* requireAddress(options.to, "to");
  const owner = yield* signerOf(client, options.account);
  const account = yield* readAccount(client, { owner });
  // Only the account itself may withdraw, so the owner runs it through the HCA.
  return onePlan(client, {
    operation: "hca.withdrawDeposit",
    account: owner,
    description: "Withdraw your HCA's deposit",
    calls: [
      executeByOwnerCall(account.address, [
        {
          to: account.address,
          data: encodeFunctionData({
            abi: standaloneSingleOwnerHcaV2Abi,
            functionName: "withdrawDepositTo",
            args: [to, options.amount],
          }),
          value: 0n,
        },
      ]),
    ],
  });
});

const write = Action.write("hca.withdrawDeposit", plan);

/** @internal Implementation of `Actions.hca.withdrawDeposit`. */
export const withdrawDeposit = write.send;

/** @internal Implementation of `Actions.hca.withdrawDepositSync`. */
export const withdrawDepositSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hca.withdrawDeposit`. */
export const withdrawDepositMethods = write.methods;
