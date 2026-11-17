import { Effect } from "effect";

import type { Account, Address } from "viem";

import type { Client } from "../../client/types.js";
import type { EnsforgeError } from "../../errors/EnsforgeError.js";

type ContextOptions = {
  readonly name?: unknown;
  readonly account?: Account | Address | undefined;
};

/** Error context for one action call: its path, ENS name, account and chain. */
export const contextOf = (
  path: string,
  client: Client,
  options: unknown,
  extra?: EnsforgeError.Context,
): EnsforgeError.Context => {
  const { name, account } = (options ?? {}) as ContextOptions;

  return {
    ...extra,
    operation: path,
    name: typeof name === "string" ? name : undefined,
    account: (typeof account === "object" ? account.address : account) ?? client.account,
    chainId: client.chain.id,
  };
};

/**
 * `Effect.fn` combinator that adds the action's context to every error it fails with, so Promise
 * and Effect users see the same `error.context`.
 */
export const withContext =
  (path: string, extra?: EnsforgeError.Context) =>
  <value, error extends EnsforgeError, requirements>(
    effect: Effect.Effect<value, error, requirements>,
    client: Client,
    options?: unknown,
  ): Effect.Effect<value, error, requirements> =>
    Effect.mapError(effect, (error) => error.withContext(contextOf(path, client, options, extra)));
