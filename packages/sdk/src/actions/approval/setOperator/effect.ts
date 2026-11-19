import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData } from "viem";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { approvalContract, nameApprovalTarget } from "../../../internal/approval/contract.js";
import { requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { setOperator as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.approval.setOperator`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const operator = yield* requireAddress(options.operator, "operator");
  const { client: target, contract } =
    options.name === undefined
      ? { client, contract: yield* approvalContract(client, options.contract) }
      : yield* nameApprovalTarget(client, options.name);

  return singleStepPlan(target, {
    operation: "approval.setOperator",
    account: options.account,
    description: options.approved ? "Approve operator" : "Revoke operator",
    calls: [
      {
        to: contract,
        data: encodeFunctionData({
          abi: Abis.shared.erc1155,
          functionName: "setApprovalForAll",
          args: [operator, options.approved],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("approval.setOperator", plan);

/** @internal Implementation of `Actions.approval.setOperator`. */
export const setOperator = write.send;

/** @internal Implementation of `Actions.approval.setOperatorSync`. */
export const setOperatorSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.approval.setOperator`. */
export const setOperatorMethods = write.methods;
