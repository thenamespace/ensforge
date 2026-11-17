import { Effect } from "effect";

import { from } from "../../client/from.js";
import type { Client, Like } from "../../client/types.js";
import { fromCause } from "../../errors/translate/fromCause.js";
import { contextOf } from "./context.js";

/** The Effect implementation behind an action: data-first, no requirements. */
export type Implementation<options, value, error> = (
  client: Client,
  options: options,
) => Effect.Effect<value, error>;

/**
 * Runs an action implementation as a Promise.
 *
 * - Accepts a bare viem client (`Ensforge.from`).
 * - Rejects with `signal.reason` when aborted, otherwise with an ensforge error carrying context.
 */
export const promise = <options, value, error>(
  path: string,
  implementation: Implementation<options, value, error>,
  client: Like,
  options: options,
): Promise<value> => {
  const { signal } = (options ?? {}) as { readonly signal?: AbortSignal | undefined };

  let ens: Client;
  try {
    ens = from(client);
  } catch (cause) {
    return Promise.reject(fromCause(cause, { operation: path }));
  }

  return Effect.runPromise(implementation(ens, options), { signal }).catch((cause: unknown) => {
    throw signal?.aborted ? signal.reason : fromCause(cause, contextOf(path, ens, options));
  });
};

/** Binds a path and an implementation into a Promise function, e.g. for `fn.prepare`. */
export const promiseOf = <options, value, error>(
  path: string,
  implementation: Implementation<options, value, error>,
) =>
  Object.assign(
    (client: Like, options: options): Promise<value> =>
      promise(path, implementation, client, options),
    { path },
  );
