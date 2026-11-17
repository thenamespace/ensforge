import { Effect } from "effect";

import { standaloneHcaFactoryV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Client } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { requireHca } from "../../../internal/deployment.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { renounceGovernance as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hcaAdmin.renounceGovernance`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const signer = yield* signerOf(client, options.account);

  return onePlan(client, {
    operation: "hcaAdmin.renounceGovernance",
    account: signer,
    description: "Renounce HCA factory ownership",
    calls: [
      {
        to: deployment.contracts.standaloneFactory,
        data: encodeFunctionData({
          abi: standaloneHcaFactoryV2Abi,
          functionName: "renounceOwnership",
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("hcaAdmin.renounceGovernance", plan);

/** @internal Implementation of `Actions.hcaAdmin.renounceGovernance`. */
export const renounceGovernance = write.send;

/** @internal Implementation of `Actions.hcaAdmin.renounceGovernanceSync`. */
export const renounceGovernanceSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hcaAdmin.renounceGovernance`. */
export const renounceGovernanceMethods = write.methods;
