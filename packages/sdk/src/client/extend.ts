import { Record as Rec } from "effect";

import { ConfigError } from "../errors/classes/ConfigError.js";
import { setState, type State } from "./state.js";
import type { Client } from "./types.js";

type Base = Omit<Client, "extend" | "client">;

/** Top-level names an action group may not use. */
const reserved = new Set(["chain", "account", "deployment", "client", "config", "extend"]);

const mergeGroups = (
  current: Readonly<Record<string, object>>,
  added: object,
): Record<string, object> => {
  const merged: Record<string, object> = { ...current };

  for (const [group, actions] of Rec.toEntries(added)) {
    if (reserved.has(group)) {
      throw new ConfigError({
        code: "INVALID_ACTION_GROUP",
        shortMessage: `"${String(group)}" is reserved on the ensforge client and cannot be an action group.`,
      });
    }
    // A top-level action such as `batch` is a function; action groups merge by key.
    merged[group] =
      typeof actions === "function"
        ? actions
        : Object.freeze({ ...merged[group], ...(actions as object) });
  }

  return merged;
};

/** Builds a frozen client from its base fields and action groups. */
export const build = (
  base: Base,
  state: State,
  groups: Readonly<Record<string, object>> = {},
): Client => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the frozen client is assembled from its base fields and action groups, which `Client` is the intersection of
  const client = Object.freeze({
    ...base,
    ...groups,
    client: (chainId: number = base.chain.id) => {
      const viemClient = state.clientOf(chainId);
      if (viemClient !== undefined) return viemClient;
      throw new ConfigError({
        code: "CHAIN_NOT_CONFIGURED",
        context: { chainId },
        hint: `Add chain ${chainId} to \`transports\` in Ensforge.create.`,
      });
    },
    extend: (decorator: (client: Client) => object) =>
      build(base, state, mergeGroups(groups, decorator(client))),
  }) as Client;

  setState(client, state);
  return client;
};
