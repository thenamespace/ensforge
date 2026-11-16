import { ConfigError } from "../errors/classes/ConfigError.js";
import { setState, type State } from "./state.js";
import type { Client } from "./types.js";

type Base = Omit<Client, "extend">;

/** Top-level names an action group may not use. */
const reserved = new Set(["chain", "account", "deployment", "publicClient", "config", "extend"]);

const mergeGroups = (
  current: Readonly<Record<string, object>>,
  added: object,
): Record<string, object> => {
  const merged: Record<string, object> = { ...current };

  for (const [group, actions] of Object.entries(added)) {
    if (reserved.has(group)) {
      throw new ConfigError({
        code: "INVALID_ACTION_GROUP",
        shortMessage: `"${group}" is reserved on the ensforge client and cannot be an action group.`,
      });
    }
    merged[group] = Object.freeze({ ...merged[group], ...(actions as object) });
  }

  return merged;
};

/** Builds a frozen client from its base fields and action groups. */
export const build = (
  base: Base,
  state: State,
  groups: Readonly<Record<string, object>> = {},
): Client => {
  const client = Object.freeze({
    ...base,
    ...groups,
    extend: (decorator: (client: Client) => object) =>
      build(base, state, mergeGroups(groups, decorator(client))),
  }) as Client;

  setState(client, state);
  return client;
};
