import { Effect } from "effect";

import { build } from "../../client/extend.js";
import { stateOf, type ChainState } from "../../client/state.js";
import type { Client } from "../../client/types.js";
import { ConfigError } from "../../errors/classes/ConfigError.js";

const clients = new WeakMap<ChainState, Client>();

/**
 * The client a write on `chainId` runs on: `client` itself on its own chain, else one over the
 * clients `chains` configures for `chainId`, with the same signer, config and plan storage. Its
 * `chain` and `publicClient` are that chain's, so signing, simulation, sending, receipts and
 * resuming all happen there.
 */
export const chainClient = (
  client: Client,
  chainId: number,
): Effect.Effect<Client, ConfigError> => {
  if (chainId === client.chain.id) return Effect.succeed(client);

  const state = stateOf(client);
  const chain = state?.chains.get(chainId);
  if (state === undefined || chain === undefined) {
    return Effect.fail(new ConfigError({ code: "CHAIN_NOT_CONFIGURED", context: { chainId } }));
  }

  const existing = clients.get(chain);
  if (existing !== undefined) return Effect.succeed(existing);

  const created = build(
    {
      chain: Object.freeze({
        id: chainId,
        name: chain.publicClient.chain?.name ?? `chain ${chainId}`,
      }),
      account: client.account,
      deployment: client.deployment,
      publicClient: chain.publicClient,
      config: client.config,
    },
    { ...state, getWalletClient: chain.getWalletClient },
  );
  clients.set(chain, created);
  return Effect.succeed(created);
};

/** Whether `client` can run writes on `chainId`: its own chain or one of its `chains`. */
export const hasChain = (client: Client, chainId: number): boolean =>
  chainId === client.chain.id || stateOf(client)?.chains.has(chainId) === true;
