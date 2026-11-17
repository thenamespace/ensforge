"use client";

import { useContext, useMemo } from "react";

import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";

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
  /** Sends the write; the outcome lands in `status`, `data` and `error`. */
  readonly mutate: (options: options) => void;
  /** Sends the write and resolves with its result, or rejects with its error. */
  readonly mutateAsync: (options: options) => Promise<value>;
  readonly data: value | undefined;
  readonly error: error | undefined;
  readonly status: "idle" | "pending" | "success" | "error";
  readonly isPending: boolean;
  /** Progress of the latest write's plan: `waiting`, `submitted`, `confirmed`, `failed`. */
  readonly steps: readonly Plan.Event[];
  readonly result: AsyncResult.AsyncResult<value, error>;
  /** Clears the result and steps. */
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
  const [result, run] = useAtom(atoms.run, { mode: "promise" });
  const steps = useAtomValue(atoms.steps);

  return {
    mutate: (options) => {
      // The outcome is in `result`; `mutateAsync` is for callers that await it.
      run(options).catch(() => undefined);
    },
    mutateAsync: run,
    data: Option.getOrUndefined(AsyncResult.value(result)),
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
    reset: () => {
      registry.set(atoms.run, Atom.Reset);
      registry.set(atoms.steps, []);
    },
  };
};
