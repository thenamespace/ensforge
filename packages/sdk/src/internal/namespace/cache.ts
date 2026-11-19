import { Clock, Effect } from "effect";

import { stateOf, type State } from "../../client/state.js";
import type { Client } from "../../client/types.js";

/** How long a client remembers where a name lives. */
const lifetime = 60_000;

type Entry = { readonly expiresAt: number; readonly value: unknown };

const caches = new WeakMap<State, Map<string, Entry>>();

/**
 * `compute`, or what it returned for `key` on this client in the last minute. Clients built
 * from one `Ensforge.create` share their cache; reads at a past block are not cached.
 */
export const remembered = <A, E, R>(
  client: Client,
  key: string,
  latest: boolean,
  compute: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const state = stateOf(client);
  if (state === undefined || !latest) return compute;

  const cache = caches.get(state) ?? new Map<string, Entry>();
  caches.set(state, cache);
  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const entry = cache.get(key);
    // The caller stores only `A`s under its keys.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    if (entry !== undefined && entry.expiresAt > now) return entry.value as A;

    const value = yield* compute;
    cache.set(key, { expiresAt: now + lifetime, value });
    return value;
  });
};

/** Forgets every remembered location of `client`, after its own writes changed them. */
export const forgetLocations = (client: Client): Effect.Effect<void> =>
  Effect.sync(() => {
    const state = stateOf(client);
    if (state !== undefined) caches.delete(state);
  });
