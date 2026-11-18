import { Stream, type Effect } from "effect";
import { Atom } from "effect/reactivity";

import type { Ensforge } from "@ensforge/sdk";
import { Indexer } from "@ensforge/sdk/effect";

import { followResults } from "./follow.js";
import { ReadInput } from "./key.js";
import { runAction } from "./run.js";
import { isServer, serverReads } from "./runtime.js";
import { readReactivityKeys, subjectsOf } from "./subjects.js";
import type { Action, ActionError, ActionOptions, ActionValue } from "./types.js";

/**
 * An indexer action that returns pages and takes a `cursor`, such as `indexer.getSubnames`.
 *
 * @category reads
 * @since 1.0.0
 */
export type PageAction = Action &
  ((
    client: never,
    options: never,
  ) =>
    | Promise<{ readonly items: readonly unknown[]; readonly cursor: string | null }>
    | Effect.Effect<
        { readonly items: readonly unknown[]; readonly cursor: string | null },
        unknown
      >);

/**
 * Pages of an indexer list as an atom: its value holds every page loaded so far, and writing to
 * it loads the next one.
 *
 * @stability unstable
 * @category reads
 * @since 1.0.0
 */
export type PagesAtom<page, error> = Atom.Writable<Atom.PullResult<page, error>, void>;

const family = Atom.family((input: ReadInput) => {
  const { client, action, options } = input;
  const pages = Indexer.paginate((cursor) =>
    runAction(action, client, { ...(options as object), cursor }),
  ) as Stream.Stream<never, never>;

  const subjects = subjectsOf(options);

  // Like `ensAtom`: server renders without `prefetch` leave the list loading.
  return Atom.pull((get) => (isServer && !get(serverReads) ? Stream.never : pages)).pipe(
    Atom.withReactivity(readReactivityKeys(client, action.path, subjects)),
    followResults(client, action.path, subjects),
    Atom.setIdleTTL("1 minute"),
  );
});

/**
 * The paginated atom of an indexer list, such as `indexer.getSubnames`. Pages accumulate as
 * they load; a write touching the list's name or account starts it over.
 *
 * **Example** (Loading subnames page by page)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 * import { ensPagesAtom } from "@ensforge/react/atoms"
 *
 * const subnames = ensPagesAtom(ens, Actions.indexer.getSubnames, { name: "ens.eth" })
 * registry.set(subnames, undefined) // load the next page
 * ```
 *
 * @stability unstable
 * @category reads
 * @since 1.0.0
 */
export const ensPagesAtom = <action extends PageAction>(
  client: Ensforge.Client,
  action: action,
  options: Omit<ActionOptions<action>, "cursor">,
): PagesAtom<ActionValue<action>, ActionError<action>> =>
  family(new ReadInput(client, action, options)) as unknown as PagesAtom<
    ActionValue<action>,
    ActionError<action>
  >;
