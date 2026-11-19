import { Effect } from "effect";

import { build } from "../../client/extend.js";
import { stateOf, type State } from "../../client/state.js";
import type { Client } from "../../client/types.js";
import { ConfigError } from "../../errors/classes/ConfigError.js";

const clients = new WeakMap<State, Map<number, Client>>();

/**
 * The client an action runs on for `chainId`: `client` itself on its own chain, else one on
 * `chainId` with the same signer, config and plan storage, reading and signing through the
 * chain's transport (or public RPC). Signing, simulation, sending, receipts and resuming all
 * happen there.
 */
export const chainClient = (
  client: Client,
  chainId: number,
): Effect.Effect<Client, ConfigError> => {
  if (chainId === client.chain.id) return Effect.succeed(client);

  const state = stateOf(client);
  const viemClient = state?.clientOf(chainId);
  if (state === undefined || viemClient === undefined) {
    return Effect.fail(new ConfigError({ code: "CHAIN_NOT_CONFIGURED", context: { chainId } }));
  }

  const byChain = clients.get(state) ?? new Map<number, Client>();
  clients.set(state, byChain);
  const existing = byChain.get(chainId);
  if (existing !== undefined) return Effect.succeed(existing);

  const created = build(
    {
      chain: Object.freeze({ id: chainId, name: viemClient.chain?.name ?? `chain ${chainId}` }),
      account: client.account,
      deployment: client.deployment,
      config: client.config,
    },
    state,
  );
  byChain.set(chainId, created);
  return Effect.succeed(created);
};

/** Whether `client` can reach `chainId`: its own chain, or one with a transport or public RPC. */
export const hasChain = (client: Client, chainId: number): boolean =>
  chainId === client.chain.id || stateOf(client)?.clientOf(chainId) !== undefined;
