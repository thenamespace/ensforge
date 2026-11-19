import { Effect } from "effect";

import { from } from "../../client/from.js";
import type { Client, Like } from "../../client/types.js";
import { toAnyErrorAsync } from "../anyError.js";
import { contextOf } from "./context.js";

/**
 * The Effect implementation behind an action: data-first, no requirements.
 *
 * @stability unstable
 */
export type Implementation<options, value, error> = (
  client: Client,
  options: options,
) => Effect.Effect<value, error>;

/**
 * Runs an action implementation as a Promise.
 *
 * - Accepts a bare viem client (`Ensforge.from`).
 * - Rejects with `signal.reason` when aborted, otherwise with an ensforge error carrying context.
 *
 * @stability unstable
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
    return toAnyErrorAsync(cause, { operation: path }).then((error) => Promise.reject(error));
  }

  return Effect.runPromise(implementation(ens, options), { signal }).catch((cause: unknown) =>
    signal?.aborted === true
      ? Promise.reject(signal.reason)
      : toAnyErrorAsync(cause, contextOf(path, ens, options)).then((error) =>
          Promise.reject(error),
        ),
  );
};

/**
 * Binds a path and an implementation into a Promise function, e.g. for `fn.prepare`.
 *
 * @stability unstable
 */
export const promiseOf = <options, value, error>(
  path: string,
  implementation: Implementation<options, value, error>,
) =>
  Object.assign(
    (client: Like, options: options): Promise<value> =>
      promise(path, implementation, client, options),
    { path },
  );
