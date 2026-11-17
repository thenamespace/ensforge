import { Effect } from "effect";

import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Client } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { hca } from "../../../hca.js";
import { onePlan, signerOf } from "../../../internal/input.js";
import type { execute as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hca.execute`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const owner = yield* signerOf(client, options.account);
  return onePlan(client, {
    operation: "hca.execute",
    account: owner,
    description: "Run calls from your HCA",
    calls: options.calls.map((call) => ({
      to: call.to,
      data: call.data ?? "0x",
      value: call.value ?? 0n,
    })),
  });
});

const write = Action.write("hca.execute", plan);

// Calls always run from the HCA: without `via`, through the owner's wallet.
const routed = <options extends { readonly via?: Write.Via | undefined }>(options: options) =>
  options.via === undefined ? { ...options, via: hca() } : options;

/** @internal Implementation of `Actions.hca.execute`. */
export const execute = (client: Client, options: Promises.Options & Write.Options) =>
  write.send(client, routed(options));

/** @internal Implementation of `Actions.hca.executeSync`. */
export const executeSync = (client: Client, options: Promises.Options & Write.SyncOptions) =>
  write.sendSync(client, routed(options));

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hca.execute`. */
export const executeMethods = {
  prepare: (client: Client, options: Promises.Options & Pick<Write.Options, "account" | "via">) =>
    write.methods.prepare(client, routed(options)),
  simulate: (client: Client, options: Promises.Options & Pick<Write.Options, "account" | "via">) =>
    write.methods.simulate(client, routed(options)),
  estimateGas: (
    client: Client,
    options: Promises.Options & Pick<Write.Options, "account" | "via">,
  ) => write.methods.estimateGas(client, routed(options)),
};
