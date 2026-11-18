import { Duration, Effect } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";

import type { Ensforge } from "@ensforge/sdk";

import { isHydrated, resultSchema } from "./codec.js";
import { followResults } from "./follow.js";
import { ReadInput } from "./key.js";
import { runAction } from "./run.js";
import { isServer, runtime, serverReads } from "./runtime.js";
import { readReactivityKeys, subjectsOf } from "./subjects.js";
import type { Action, ActionError, ActionOptions, ActionValue } from "./types.js";

/**
 * How long a read stays fresh and cached. Each hook's settings apply to it alone; hooks with
 * other settings still share the read's value and requests.
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export type Freshness = {
  /**
   * After this long, the next mount or window focus refetches in the background while the
   * cached value is shown (stale-while-revalidate). `Duration.infinity` never does. Without it,
   * a value hydrated from the server is stale after 30 seconds; a failed read is always stale,
   * so a remount retries it.
   */
  readonly staleTime?: Duration.Input | undefined;
  /**
   * How long an unused read stays cached; `"forever"` or `Duration.infinity` keeps it. With
   * hooks of several settings, the longest applies.
   *
   * @default "1 minute"
   */
  readonly idleTTL?: Duration.Input | "forever" | undefined;
  /** Refetch on this interval while the read is in use, in the browser only. */
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
 * @stability unstable
 * @category reads
 * @since 1.0.0
 */
export type ReadAtom<value, error> = Atom.Atom<AsyncResult.AsyncResult<value, error>>;

/** Freshness in one shape: durations in milliseconds, `Infinity` for never and forever. */
type Settings = {
  readonly staleTime: number | undefined;
  readonly idleTTL: number;
  readonly refetchInterval: number | undefined;
  readonly refreshOnWindowFocus: boolean;
};

/** Settings of a read's freshness; equal settings give equal objects, whatever their form. */
export const settingsOf = (freshness: Freshness): Settings => ({
  staleTime: freshness.staleTime === undefined ? undefined : Duration.toMillis(freshness.staleTime),
  idleTTL:
    freshness.idleTTL === "forever" ? Infinity : Duration.toMillis(freshness.idleTTL ?? "1 minute"),
  refetchInterval:
    freshness.refetchInterval === undefined
      ? undefined
      : Duration.toMillis(freshness.refetchInterval),
  refreshOnWindowFocus: freshness.refreshOnWindowFocus ?? false,
});

// One atom per read key, shared by every hook that reads it. It is serializable, so prefetched
// values hydrate into it and are kept on mount instead of being fetched again. The hooks' atoms
// below keep it alive.
const base = Atom.family((input: ReadInput) => {
  const { client, action, options } = input;
  const subjects = subjectsOf(options);
  const atom = runtime
    .atom((get) =>
      isServer && !get(serverReads) ? Effect.never : runAction(action, client, options),
    )
    .pipe(
      Atom.withReactivity(readReactivityKeys(client, action.path, subjects)),
      followResults(client, action.path, subjects),
      Atom.setIdleTTL(0),
    );

  return Atom.serializable(atom, {
    key: input.id,
    // The erased cache key type cannot name the result schema `serializable` expects.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    schema: resultSchema as never,
    skipInitialRun: true,
  });
});

// Hydrated values have no `staleTime` of their own: they revalidate once this old.
const hydratedStaleTime = 30_000;

/**
 * What a mount does with the cached result: a failure is retried at once, so a remount (or an
 * error boundary reset) fetches again instead of showing the old error; a hydrated value older
 * than `hydratedStaleTime` revalidates in the background when the read sets no `staleTime`.
 */
const revalidateOnMount = (
  source: Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>>,
  key: string,
  staleTime: number | undefined,
) =>
  Atom.transform(source, (get) => {
    const cached = get.registry.getNodes().has(key);
    let current = get.once(source);
    if (cached && AsyncResult.isFailure(current) && !current.waiting) {
      get.refresh(source);
      current = get.once(source);
    }
    get.subscribe(source, (value) => get.setSelf(value));

    if (
      staleTime === undefined &&
      AsyncResult.isSuccess(current) &&
      isHydrated(current) &&
      // AsyncResult timestamps are wall-clock milliseconds, compared synchronously inside an atom.
      // oxlint-disable-next-line effecttsgo/global-date
      Date.now() - current.timestamp >= hydratedStaleTime
    ) {
      // After the read, as `Atom.swr` does: hydration renders the server's value first.
      let active = true;
      get.addFinalizer(() => (active = false));
      get.registry.schedulerAsync.makeDispatcher().scheduleTask(() => {
        if (active) get.refresh(source);
      }, 0);
    }
    return current;
  });

// A hook's view of a read: its freshness over the shared atom. Refreshing it refreshes the read.
const fresh = Atom.family((input: { readonly read: ReadInput; readonly settings: Settings }) => {
  const { read, settings } = input;
  const source = base(read);

  // The only atom with a TTL: it holds the read for `idleTTL` after its last user unmounts, so
  // the atoms above it are rebuilt, and check the cached result, on every mount.
  const held = Atom.setIdleTTL(
    Atom.transform(source, (get) => get(source)),
    settings.idleTTL,
  );
  let atom = revalidateOnMount(held, read.id, settings.staleTime);
  // Servers render once: polling there would only keep the request's registry busy.
  const { refetchInterval } = settings;
  if (!isServer && refetchInterval !== undefined && Number.isFinite(refetchInterval))
    atom = Atom.withRefresh(atom, refetchInterval);
  if (settings.staleTime !== undefined) {
    atom = Atom.swr(atom, {
      staleTime: settings.staleTime,
      revalidateOnFocus: settings.refreshOnWindowFocus,
      focusSignal: Atom.windowFocusSignal,
    });
  } else if (settings.refreshOnWindowFocus) {
    atom = Atom.makeRefreshOnSignal(Atom.windowFocusSignal)(atom);
  }
  return atom;
});

/**
 * The atom of one read: cached per client (chain, account and indexer), action and options,
 * refreshed when a write touches a name or address in its options, and serializable for server
 * rendering. Each freshness gets its own atom over the shared read.
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
 * @stability unstable
 * @category reads
 * @since 1.0.0
 */
export const ensAtom = <action extends Action>(
  client: Ensforge.Client,
  action: action,
  options: ActionOptions<action>,
  freshness: Freshness = {},
): ReadAtom<ActionValue<action>, ActionError<action>> =>
  // The family is keyed by the erased action; the caller's action types the atom.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  fresh({
    read: new ReadInput(client, action, options),
    settings: settingsOf(freshness),
  }) as ReadAtom<ActionValue<action>, ActionError<action>>;
