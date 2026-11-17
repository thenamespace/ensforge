import { Effect } from "effect";
import { Atom } from "effect/reactivity";

import type { Ensforge, Plan } from "@ensforge/sdk";

import { refreshAfterWrite } from "./refresh.js";
import { runAction } from "./run.js";
import { runtime } from "./runtime.js";
import type { Action, ActionError, ActionOptions, ActionValue } from "./types.js";

/**
 * A write as atoms: `run` sends it and holds its result; `steps` holds the plan's progress
 * events of the latest run.
 *
 * @category writes
 * @since 1.0.0
 */
export type WriteAtom<options, value, error> = {
  readonly run: Atom.AtomResultFn<options, value, error>;
  readonly steps: Atom.Writable<readonly Plan.Event[]>;
};

/**
 * Atoms for one write action. Each call makes new atoms, so every form or button has its own
 * state; hooks keep one per component.
 *
 * **Details**
 *
 * - Plan events (`waiting`, `submitted`, `confirmed`, `failed`) collect in `steps`.
 * - After a write, reads of the names and accounts it touched refresh: chain reads once its
 *   transactions are mined, indexer reads once the indexer has caught up.
 * - Runs never interrupt each other: a sent transaction cannot be taken back.
 *
 * **Example** (Sending a write from an atom)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 * import { ensWriteAtom } from "@ensforge/react/atoms"
 *
 * const setRecords = ensWriteAtom(ens, Actions.record.set)
 * registry.set(setRecords.run, { name: "alice.eth", texts: { url: "https://alice.xyz" } })
 * ```
 *
 * @category writes
 * @since 1.0.0
 */
export const ensWriteAtom = <action extends Action>(
  client: Ensforge.Client,
  action: action,
): WriteAtom<ActionOptions<action>, ActionValue<action>, ActionError<action>> => {
  const steps = Atom.make<readonly Plan.Event[]>([]);

  const run = runtime.fn(
    (options: ActionOptions<action>, get) =>
      Effect.gen(function* () {
        get.set(steps, []);
        const own = (options as { readonly onStep?: (event: Plan.Event) => void }).onStep;
        const onStep = (event: Plan.Event) => {
          own?.(event);
          get.set(steps, [...get(steps), event]);
        };

        const value = yield* runAction(action, client, { ...(options as object), onStep });
        yield* Effect.forkDetach(refreshAfterWrite(client, options, value));
        return value;
      }),
    { concurrent: true },
  );

  return { run, steps };
};
