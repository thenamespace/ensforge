"use client";

import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/reactivity";

import type { Ensforge } from "@ensforge/sdk";

import { ensAtom, type Freshness, type ReadAtom } from "../atoms/read.js";
import type { Action, ActionError, ActionOptions, ActionValue } from "../atoms/types.js";
import { useEnsforgeContext } from "../provider/context.js";
import { toReadResult, type ReadResult } from "./result.js";

/**
 * Settings of a read hook: its freshness, whether it runs, and an optional client.
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export type ReadConfig = Freshness & {
  /**
   * Run the read. Passing `undefined` options also disables it, e.g. until a name is typed.
   *
   * @default true
   */
  readonly enabled?: boolean | undefined;
  /** Client to read with instead of the provider's. */
  readonly client?: Ensforge.Client | undefined;
};

const idle = Atom.make(AsyncResult.initial(false));

/**
 * Reads with any ensforge action and keeps the result fresh.
 *
 * **When to use**
 *
 * Use for any read, from either `@ensforge/sdk` or `@ensforge/sdk/effect`. Named hooks such as
 * `useAddress` are presets of this one.
 *
 * **Details**
 *
 * - Components reading the same action and options share one request and one cached result.
 * - Unmounting keeps the result, and a request in flight, cached for `idleTTL`; a remount within
 *   it reuses them, and retries a failed read. Writes that touch the read's names or accounts
 *   refetch it.
 * - Pass `undefined` options (or `enabled: false`) to wait, e.g. until a name is typed.
 *
 * **Example** (Reading a role)
 *
 * ```tsx
 * import { Actions } from "@ensforge/sdk"
 * import { useRead } from "@ensforge/react"
 *
 * function CanEdit({ name, account }: { name: string; account: `0x${string}` }) {
 *   const { data, isLoading } = useRead(Actions.permission.get, { name, account })
 *   return isLoading ? null : <span>{String(data?.can.setRecords)}</span>
 * }
 * ```
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export const useRead = <action extends Action>(
  action: action,
  options: ActionOptions<action> | undefined,
  config: ReadConfig = {},
): ReadResult<ActionValue<action>, ActionError<action>> => {
  const { enabled = true, client: own, ...freshness } = config;
  const { client, defaults } = useEnsforgeContext(own);
  const atom: ReadAtom<ActionValue<action>, ActionError<action>> = enabled && options !== undefined
    ? ensAtom(client, action, options, { ...defaults, ...freshness })
    : idle;
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);

  return toReadResult(result, refresh);
};
