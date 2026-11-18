import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Client, requireAddress } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { requireHca } from "../../../internal/deployment.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { setUpgradeApproval as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hcaAdmin.setUpgradeApproval`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const signer = yield* signerOf(client, options.account);
  const implementation = yield* requireAddress(options.implementation, "implementation");

  return onePlan(client, {
    operation: "hcaAdmin.setUpgradeApproval",
    account: signer,
    description: "Set HCA upgrade approval",
    calls: [
      {
        to: deployment.contracts.upgradeSet,
        data: encodeFunctionData({
          abi: Abis.v2.permissionedAddressSet,
          functionName: "approve",
          args: [implementation, options.approved],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("hcaAdmin.setUpgradeApproval", plan);

/** @internal Implementation of `Actions.hcaAdmin.setUpgradeApproval`. */
export const setUpgradeApproval = write.send;

/** @internal Implementation of `Actions.hcaAdmin.setUpgradeApprovalSync`. */
export const setUpgradeApprovalSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hcaAdmin.setUpgradeApproval`. */
export const setUpgradeApprovalMethods = write.methods;
