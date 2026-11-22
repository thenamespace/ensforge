import { Effect } from "effect";

import { standaloneSingleOwnerHcaV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, makePlan, type Client } from "@ensforge/sdk/extension";
import { encodeFunctionData } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { readAccount } from "../../../internal/account.js";
import { deployCall } from "../../../internal/calls.js";
import { requireHca } from "../../../internal/deployment.js";
import { signerOf } from "../../../internal/input.js";
import type { revokeSessions as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.hca.revokeSessions`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, Errors.AnyError | HcaError> {
  const deployment = yield* requireHca(client);
  const owner = yield* signerOf(client, options.account);
  const account = yield* readAccount(client, { owner });

  // A session signed for an undeployed HCA becomes usable as soon as anyone deploys it, so the
  // HCA is deployed first. `revokeSessions` is owner-only: the owner sends it, never the HCA.
  const revoke: Plan.Call = {
    to: account.address,
    data: encodeFunctionData({
      abi: standaloneSingleOwnerHcaV2Abi,
      functionName: "revokeSessions",
    }),
    value: 0n,
  };
  return makePlan({
    operation: "hca.revokeSessions",
    chainId: client.chain.id,
    account: owner,
    steps: [
      {
        id: "write",
        description: "Revoke HCA sessions",
        calls: account.deployed
          ? [revoke]
          : [
              deployCall(
                deployment.contracts.standaloneFactory,
                owner,
                deployment.contracts.standaloneImplementation,
              ),
              revoke,
            ],
        from: "signer",
      },
    ],
    warnings: account.deployed
      ? []
      : [
          {
            code: "HCA_DEPLOYED",
            message: "Your HCA is deployed first, so its sessions can be revoked.",
          },
        ],
  });
});

const write = Action.write("hca.revokeSessions", plan);

// The owner's own transaction: a route would only add an HCA execution around it.
const unrouted = <options extends { readonly via?: Write.Via | undefined }>(options: options) => ({
  ...options,
  via: undefined,
});

/** @internal Implementation of `Actions.hca.revokeSessions`. */
export const revokeSessions = (client: Client, options: Promises.Options & Write.Options) =>
  write.send(client, unrouted(options));

/** @internal Implementation of `Actions.hca.revokeSessionsSync`. */
export const revokeSessionsSync = (client: Client, options: Promises.Options & Write.SyncOptions) =>
  write.sendSync(client, unrouted(options));

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.hca.revokeSessions`. */
export const revokeSessionsMethods = {
  prepare: Object.assign(
    (client: Client, options: Promises.Options & Pick<Write.Options, "account" | "via">) =>
      write.methods.prepare(client, unrouted(options)),
    { path: write.methods.prepare.path },
  ),
  simulate: Object.assign(
    (client: Client, options: Promises.Options & Pick<Write.Options, "account" | "via">) =>
      write.methods.simulate(client, unrouted(options)),
    { path: write.methods.simulate.path },
  ),
  estimateGas: Object.assign(
    (client: Client, options: Promises.Options & Pick<Write.Options, "account" | "via">) =>
      write.methods.estimateGas(client, unrouted(options)),
    { path: write.methods.estimateGas.path },
  ),
};
