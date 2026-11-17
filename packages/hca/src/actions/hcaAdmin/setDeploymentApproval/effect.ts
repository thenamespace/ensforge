import { Effect } from "effect";

import { standaloneHcaFactoryV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import type { Errors, Plan, Write } from "@ensforge/sdk";
import { requireAddress } from "@ensforge/sdk/extension";
import { Action, type Client } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { requireHca } from "../../../internal/deployment.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { setDeploymentApproval as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hcaAdmin.setDeploymentApproval`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const signer = yield* signerOf(client, options.account);
  const implementation = yield* requireAddress(options.implementation, "implementation");
  return onePlan(client, {
    operation: "hcaAdmin.setDeploymentApproval",
    account: signer,
    description: "Set HCA deployment approval",
    calls: [
      {
        to: deployment.contracts.standaloneFactory,
        data: encodeFunctionData({
          abi: standaloneHcaFactoryV2Abi,
          functionName: "setImplementationApproval",
          args: [implementation, options.approved],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("hcaAdmin.setDeploymentApproval", plan);

/** @internal Implementation of `Actions.hcaAdmin.setDeploymentApproval`. */
export const setDeploymentApproval = write.send;

/** @internal Implementation of `Actions.hcaAdmin.setDeploymentApprovalSync`. */
export const setDeploymentApprovalSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hcaAdmin.setDeploymentApproval`. */
export const setDeploymentApprovalMethods = write.methods;
