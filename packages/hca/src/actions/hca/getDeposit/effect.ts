import { Effect } from "effect";

import { Action, type AnyError, type Client, Rpc } from "@ensforge/sdk/extension";
import { entryPoint07Abi } from "viem/account-abstraction";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { requireHca } from "../../../internal/deployment.js";
import { accountInput } from "../../../internal/input.js";
import type { getDeposit as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.getDeposit`. */
export const getDeposit = Effect.fn("ensforge.hca.getDeposit")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const account = yield* accountInput(client, options);
  return yield* Rpc.readContract(client, {
    address: deployment.contracts.entryPoint,
    abi: entryPoint07Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
}, Action.withContext("hca.getDeposit"));
