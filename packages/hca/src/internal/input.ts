import { Effect } from "effect";

import { Errors, type Plan } from "@ensforge/core";
import { addressOf, makePlan, requireAddress, type Client } from "@ensforge/core/extension";
import type { Account, Address } from "viem";

import type { HcaError } from "../errors/classes/HcaError.js";
import type { HcaAccount } from "../types.js";
import { readAccount } from "./account.js";

/** The signer of a write: the per-call account, else the client's. */
export const signerOf = (
  client: Client,
  account: Account | Address | undefined,
): Effect.Effect<Address, Errors.AnyError> => {
  const signer = addressOf(account) ?? client.account;
  return signer === undefined
    ? Effect.fail(new Errors.ConfigError({ code: "WALLET_NOT_CONFIGURED" }))
    : Effect.succeed(signer);
};

/** An HCA by address, or the HCA of an owner (by default the client's account). */
export const accountInput = Effect.fnUntraced(function* (
  client: Client,
  options: { readonly address?: string | undefined; readonly owner?: string | undefined },
): Effect.fn.Return<HcaAccount, Errors.AnyError | HcaError> {
  if (options.address !== undefined) {
    const address = yield* requireAddress(options.address, "address");
    return yield* readAccount(client, { address });
  }
  const owner =
    options.owner === undefined
      ? yield* signerOf(client, undefined)
      : yield* requireAddress(options.owner, "owner");
  return yield* readAccount(client, { owner });
});

/** A one-step plan sent by the signer. */
export const onePlan = (
  client: Client,
  options: {
    readonly operation: string;
    readonly account: Address;
    readonly description: string;
    readonly calls: readonly Plan.Call[];
    readonly warnings?: readonly Plan.Warning[] | undefined;
  },
): Plan =>
  makePlan({
    operation: options.operation,
    chainId: client.chain.id,
    account: options.account,
    steps: [{ id: "write", description: options.description, calls: options.calls }],
    ...(options.warnings === undefined ? {} : { warnings: options.warnings }),
  });
