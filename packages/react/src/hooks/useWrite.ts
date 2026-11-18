"use client";

import { useCallback, useContext, useMemo } from "react";

import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Effect } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";

import type { Ensforge, Plan } from "@ensforge/sdk";

import type { Action, ActionError, ActionOptions, ActionValue } from "../atoms/types.js";
import { ensWriteAtom } from "../atoms/write.js";
import { useEnsforgeContext } from "../provider/context.js";
import { errorOf } from "./result.js";

/**
 * What {@link useWrite} returns.
 *
 * @category writes
 * @since 1.0.0
 */
export type WriteResult<options, value, error> = {
  /** Sends the write; the outcome lands in `status`, `data` and `error`. Stable across renders. */
  readonly mutate: (options: options) => void;
  /**
   * Sends the write and resolves with its own result, or rejects with its error, even when
   * later writes start while it runs. Stable across renders.
   */
  readonly mutateAsync: (options: options) => Promise<value>;
  /** The latest write's value, once it succeeded. */
  readonly data: value | undefined;
  readonly error: error | undefined;
  /** Status of the latest write started. */
  readonly status: "idle" | "pending" | "success" | "error";
  readonly isPending: boolean;
  /** Progress of the latest write's plan: `waiting`, `submitted`, `confirmed`, `failed`. */
  readonly steps: readonly Plan.Event[];
  readonly result: AsyncResult.AsyncResult<value, error>;
  /**
   * Clears the result and steps. Writes in flight are not interrupted (a sent transaction cannot
   * be taken back): their `mutateAsync` promises still settle, but they no longer update the
   * state. Stable across renders.
   */
  readonly reset: () => void;
};

/**
 * Sends any ensforge write and tracks it.
 *
 * **When to use**
 *
 * Use for any write. Named hooks such as `useSetRecords` are presets of this one. Use the
 * `…Sync` action (e.g. `Actions.record.setSync`) to resolve with receipts.
 *
 * **Details**
 *
 * - Each component gets its own state; two buttons never share a result.
 * - The state follows the latest write started; each `mutateAsync` settles with its own write.
 * - `steps` lists plan events as they happen, for multi-step writes (approve, commit, register).
 * - Afterwards, reads of the names and accounts it touched refetch: chain reads once mined,
 *   indexer reads once indexed.
 *
 * **Example** (Saving records with progress)
 *
 * ```tsx
 * import { Actions } from "@ensforge/sdk"
 * import { useWrite } from "@ensforge/react"
 *
 * function Save({ name }: { name: string }) {
 *   const { mutate, isPending, steps } = useWrite(Actions.record.set)
 *   return (
 *     <button disabled={isPending} onClick={() => mutate({ name, texts: { url: "https://alice.xyz" } })}>
 *       {isPending ? `${steps.length} step(s) done` : "Save"}
 *     </button>
 *   )
 * }
 * ```
 *
 * @category writes
 * @since 1.0.0
 */
export const useWrite = <action extends Action>(
  action: action,
  config: { readonly client?: Ensforge.Client | undefined } = {},
): WriteResult<ActionOptions<action>, ActionValue<action>, ActionError<action>> => {
  const { client } = useEnsforgeContext(config.client);
  const registry = useContext(RegistryContext);
  const atoms = useMemo(() => ensWriteAtom(client, action), [client, action]);
  const result = useAtomValue(atoms.run);
  const steps = useAtomValue(atoms.steps);

  const mutateAsync = useCallback(
    (options: ActionOptions<action>) =>
      Effect.runPromise(
        atoms.send(options).pipe(Effect.provideService(AtomRegistry.AtomRegistry, registry)),
      ),
    [atoms, registry],
  );
  const mutate = useCallback(
    (options: ActionOptions<action>) => {
      // The outcome is in `result`; `mutateAsync` is for callers that await it.
      mutateAsync(options).catch(() => undefined);
    },
    [mutateAsync],
  );
  const reset = useCallback(() => registry.set(atoms.run, Atom.Reset), [atoms, registry]);

  return {
    mutate,
    mutateAsync,
    data: AsyncResult.isSuccess(result) ? result.value : undefined,
    error: errorOf(result),
    status: result.waiting
      ? "pending"
      : AsyncResult.isSuccess(result)
        ? "success"
        : AsyncResult.isFailure(result)
          ? "error"
          : "idle",
    isPending: result.waiting,
    steps,
    result,
    reset,
  };
};
