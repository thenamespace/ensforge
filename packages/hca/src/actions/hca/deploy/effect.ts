import { Effect } from "effect";

import type { Errors, Plan, Write } from "@ensforge/core";
import { Action, type Client } from "@ensforge/core/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { deployCall } from "../../../internal/calls.js";
import { requireHca } from "../../../internal/deployment.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { deploy as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hca.deploy`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const owner = yield* signerOf(client, options.account);
  return onePlan(client, {
    operation: "hca.deploy",
    account: owner,
    description: "Deploy your HCA",
    calls: [
      deployCall(
        deployment.contracts.standaloneFactory,
        owner,
        deployment.contracts.standaloneImplementation,
      ),
    ],
  });
});

const write = Action.write("hca.deploy", plan);

/** @internal Implementation of `Actions.hca.deploy`. */
export const deploy = write.send;

/** @internal Implementation of `Actions.hca.deploySync`. */
export const deploySync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hca.deploy`. */
export const deployMethods = write.methods;
