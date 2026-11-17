import { Duration, Effect } from "effect";
import { Atom, type AsyncResult } from "effect/reactivity";

import type { Ensforge } from "@ensforge/sdk";

import { resultSchema } from "./codec.js";
import { ReadInput } from "./key.js";
import { runAction } from "./run.js";
import { isServer, runtime, serverReads } from "./runtime.js";
import { readReactivityKeys, subjectsOf } from "./subjects.js";
import type { Action, ActionError, ActionOptions, ActionValue } from "./types.js";

/**
 * How long a read stays fresh and cached.
 *
 * @category reads
 * @since 1.0.0
 */
export type Freshness = {
  /**
   * After this long, the next mount or window focus refetches in the background while the
   * cached value is shown (stale-while-revalidate).
   */
  readonly staleTime?: Duration.Input | undefined;
  /**
   * How long an unused read stays cached; `"forever"` keeps it.
   *
   * @default "1 minute"
   */
  readonly idleTTL?: Duration.Input | "forever" | undefined;
  /** Refetch on this interval while the read is in use. */
  readonly refetchInterval?: Duration.Input | undefined;
  /**
   * Refetch when the window regains focus (respecting `staleTime` when set).
   *
   * @default false
   */
  readonly refreshOnWindowFocus?: boolean | undefined;
};

/**
 * A read atom: an Effect Atom holding the read's `AsyncResult`.
 *
 * @category reads
 * @since 1.0.0
 */
export type ReadAtom<value, error> = Atom.Atom<AsyncResult.AsyncResult<value, error>>;

const family = Atom.family((input: ReadInput) => {
  const { client, action, options } = input;
  const freshness = JSON.parse(input.freshness) as Freshness;
  const subjects = subjectsOf(options);

  let atom: Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>> = runtime.atom((get) =>
    isServer && !get(serverReads) ? Effect.never : runAction(action, client, options),
  );
  atom = atom.pipe(Atom.withReactivity(readReactivityKeys(client, action.path, subjects)));
  atom =
    freshness.idleTTL === "forever"
      ? Atom.keepAlive(atom)
      : Atom.setIdleTTL(atom, freshness.idleTTL ?? "1 minute");
  if (freshness.refetchInterval !== undefined)
    atom = Atom.withRefresh(atom, freshness.refetchInterval);
  if (freshness.staleTime !== undefined) {
    atom = Atom.swr(atom, {
      staleTime: freshness.staleTime,
      revalidateOnFocus: freshness.refreshOnWindowFocus ?? false,
      focusSignal: Atom.windowFocusSignal,
    });
  } else if (freshness.refreshOnWindowFocus === true) {
    atom = Atom.makeRefreshOnSignal(Atom.windowFocusSignal)(atom);
  }

  // Serializable last: the freshness wrappers drop the metadata. A hydrated value is kept on
  // mount instead of being fetched again.
  return Atom.serializable(atom, {
    key: input.id,
    schema: resultSchema as never,
    skipInitialRun: true,
  });
});

/**
 * The atom of one read: cached per client, action and options, refreshed when a write touches
 * a name or address in its options, and serializable for server rendering.
 *
 * **When to use**
 *
 * Use to compose ENS reads into your own atoms, or to read them outside React hooks. Hooks such
 * as `useRead` use the same atoms.
 *
 * **Example** (Composing reads)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 * import { ensAtom } from "@ensforge/react/atoms"
 * import { Atom } from "effect/reactivity"
 *
 * const profile = Atom.make((get) => ({
 *   address: get(ensAtom(ens, Actions.record.getAddress, { name: "nick.eth" })),
 *   avatar: get(ensAtom(ens, Actions.record.getAvatar, { name: "nick.eth" })),
 * }))
 * ```
 *
 * @category reads
 * @since 1.0.0
 */
export const ensAtom = <action extends Action>(
  client: Ensforge.Client,
  action: action,
  options: ActionOptions<action>,
  freshness: Freshness = {},
): ReadAtom<ActionValue<action>, ActionError<action>> =>
  family(
    new ReadInput(
      client,
      action,
      options,
      JSON.stringify(freshness, (_, value: unknown) =>
        Duration.isDuration(value) ? Duration.toMillis(value) : value,
      ),
    ),
  ) as ReadAtom<ActionValue<action>, ActionError<action>>;
