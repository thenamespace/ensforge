import { custom } from "viem";

import { ConfigError } from "../errors/classes/ConfigError.js";
import { create } from "./create.js";
import { stateOf } from "./state.js";
import type { Client, Like, ViemClientLike } from "./types.js";

/**
 * Whether `value` is an ensforge client.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export const is = (value: unknown): value is Client => stateOf(value) !== undefined;

const created = new WeakMap<ViemClientLike, Client>();

/**
 * Returns `client` when it is an ensforge client, otherwise an ensforge client for the viem
 * client, created once and reused.
 *
 * **When to use**
 *
 * Use in your own helpers that accept either client. Every action already does this.
 *
 * @throws `Errors.ConfigError` (`UNKNOWN_CHAIN`) when a bare viem client is on a chain without a
 * built-in deployment.
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export const from = (client: Like): Client => {
  if (is(client)) return client;

  const viemClient = client;
  const existing = created.get(viemClient);
  if (existing !== undefined) return existing;

  const { chain } = viemClient;
  if (chain === undefined) {
    throw new ConfigError({
      code: "UNKNOWN_CHAIN",
      hint: "Create the viem client with a `chain`.",
    });
  }
  // Reads go through the client itself; a client with an account also signs.
  const ens = create({
    chain,
    transports: { [chain.id]: custom({ request: viemClient.request }) },
    pollingInterval: viemClient.pollingInterval,
    ...(viemClient.account === undefined ? {} : { wallet: viemClient }),
  });
  created.set(viemClient, ens);
  return ens;
};
