import { Effect } from "effect";

import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Client } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { requireHca } from "../../../internal/deployment.js";
import { accountInput, onePlan, signerOf } from "../../../internal/input.js";
import type { addDeposit as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hca.addDeposit`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const signer = yield* signerOf(client, options.account);
  const account = yield* accountInput(client, { address: options.address, owner: signer });

  return onePlan(client, {
    operation: "hca.addDeposit",
    account: signer,
    description: "Fund your HCA's deposit",
    calls: [
      {
        to: deployment.contracts.entryPoint,
        data: encodeFunctionData({
          abi: entryPoint07Abi,
          functionName: "depositTo",
          args: [account.address],
        }),
        value: options.amount,
      },
    ],
  });
});

const write = Action.write("hca.addDeposit", plan);

/** @internal Implementation of `Actions.hca.addDeposit`. */
export const addDeposit = write.send;

/** @internal Implementation of `Actions.hca.addDepositSync`. */
export const addDepositSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hca.addDeposit`. */
export const addDepositMethods = write.methods;
