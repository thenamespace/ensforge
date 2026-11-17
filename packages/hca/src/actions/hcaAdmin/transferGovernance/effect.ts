import { Effect } from "effect";

import { standaloneHcaFactoryV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Client, requireAddress } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { requireHca } from "../../../internal/deployment.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { transferGovernance as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hcaAdmin.transferGovernance`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const signer = yield* signerOf(client, options.account);
  const newOwner = yield* requireAddress(options.newOwner, "newOwner");

  return onePlan(client, {
    operation: "hcaAdmin.transferGovernance",
    account: signer,
    description: "Transfer HCA factory ownership",
    calls: [
      {
        to: deployment.contracts.standaloneFactory,
        data: encodeFunctionData({
          abi: standaloneHcaFactoryV2Abi,
          functionName: "transferOwnership",
          args: [newOwner],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("hcaAdmin.transferGovernance", plan);

/** @internal Implementation of `Actions.hcaAdmin.transferGovernance`. */
export const transferGovernance = write.send;

/** @internal Implementation of `Actions.hcaAdmin.transferGovernanceSync`. */
export const transferGovernanceSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hcaAdmin.transferGovernance`. */
export const transferGovernanceMethods = write.methods;
