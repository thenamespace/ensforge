import { Effect, Exit, Predicate } from "effect";
import { AsyncResult, Atom, AtomRegistry, Reactivity } from "effect/reactivity";

import type { Ensforge, Plan, Write } from "@ensforge/sdk";

import { refreshAfterWrite } from "./refresh.js";
import { currentRegistry, reactivity } from "./registry.js";
import { runAction } from "./run.js";
import type { Action, ActionError, ActionOptions, ActionValue } from "./types.js";

/**
 * A write as atoms: `run` holds the latest write's result and sends one when set; `steps` holds
 * that write's plan events; `send` sends one and ends with its own result.
 *
 * @stability unstable
 * @category writes
 * @since 1.0.0
 */
export type WriteAtom<options, value, error> = {
  /** The latest write's result. Setting options sends a write; `Atom.Reset` clears the result. */
  readonly run: Atom.Writable<AsyncResult.AsyncResult<value, error>, options | Atom.Reset>;
  readonly steps: Atom.Writable<readonly Plan.Event[]>;
  /**
   * Sends a write and ends with its own result, even when later writes start while it runs.
   * `run` and `steps` show it until a later one starts.
   */
  readonly send: (options: options) => Effect.Effect<value, error, AtomRegistry.AtomRegistry>;
};

/**
 * Atoms for one write action. Each call makes new atoms, so every form or button has its own
 * state; hooks keep one per component.
 *
 * **Details**
 *
 * - `run` and `steps` show the latest write started; mount `run` while writing through it.
 * - Writes never interrupt each other, and resetting interrupts none: a sent transaction cannot
 *   be taken back. Each `send` still ends with its own write's result.
 * - Plan events (`waiting`, `submitted`, `confirmed`, `failed`) collect in `steps`.
 * - After a write, reads of the names and accounts it touched refresh: chain reads once its
 *   transactions are mined, indexer reads once the indexer has caught up. A write that fails
 *   after a step was confirmed refreshes them too. Signatures (`primaryName.signClaim`) send no
 *   transaction and refresh nothing.
 *
 * **Example** (Sending a write from an atom)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 * import { ensWriteAtom } from "@ensforge/react/atoms"
 *
 * const setRecords = ensWriteAtom(ens, Actions.record.set)
 * registry.mount(setRecords.run)
 * registry.set(setRecords.run, { name: "alice.eth", texts: { url: "https://alice.xyz" } })
 * ```
 *
 * @stability unstable
 * @category writes
 * @since 1.0.0
 */
export const ensWriteAtom = <action extends Action>(
  client: Ensforge.Client,
  action: action,
): WriteAtom<ActionOptions<action>, ActionValue<action>, ActionError<action>> => {
  type Latest = {
    // Identity of the latest write; earlier ones still running leave `result` and `steps` alone.
    readonly write: object | undefined;
    readonly result: AsyncResult.AsyncResult<ActionValue<action>, ActionError<action>>;
  };
  const latest = Atom.make<Latest>({ write: undefined, result: AsyncResult.initial() });
  const steps = Atom.make<readonly Plan.Event[]>([]);

  const send = Effect.fnUntraced(function* (options: ActionOptions<action>) {
    const registry = yield* AtomRegistry.AtomRegistry;
    const write = {};
    const isLatest = () => registry.get(latest).write === write;
    let confirmed = false;

    registry.set(latest, { write, result: AsyncResult.initial(true) });
    registry.set(steps, []);
    const own = (options as { readonly onStep?: (event: Plan.Event) => void }).onStep;
    const onStep = (event: Plan.Event) => {
      own?.(event);
      confirmed ||= event.status === "confirmed";
      if (isLatest()) registry.set(steps, [...registry.get(steps), event]);
    };

    const exit = yield* Effect.exit(runAction(action, client, { ...(options as object), onStep }));
    if (isLatest()) registry.set(latest, { write, result: AsyncResult.fromExit(exit) });

    const written = Exit.isSuccess(exit) ? exit.value : undefined;
    if (Predicate.hasProperty(written, "hashes") || (Exit.isFailure(exit) && confirmed)) {
      yield* Effect.forkDetach(
        refreshAfterWrite(client, options, written as Write.Result | undefined).pipe(
          Effect.provideService(
            Reactivity.Reactivity,
            AsyncResult.getOrThrow(registry.get(reactivity)),
          ),
        ),
      );
    }
    return yield* exit;
  });

  const run = Atom.writable(
    (get) => get(latest).result,
    (context, input: ActionOptions<action> | Atom.Reset) => {
      if (input === Atom.Reset) {
        context.set(latest, { write: undefined, result: AsyncResult.initial() });
        context.set(steps, []);
        return;
      }
      // The outcome is in `run`; `send` is for callers that await it.
      Effect.runFork(
        send(input).pipe(
          Effect.provideService(AtomRegistry.AtomRegistry, context.get(currentRegistry)),
          Effect.exit,
        ),
      );
    },
  );

  return { run, steps, send };
};
