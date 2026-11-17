"use client";

import type { Plan } from "@ensforge/sdk";

import type { Action, ActionError, ActionOptions } from "../atoms/types.js";
import type { ReadResult } from "./result.js";
import { useRead, type ReadConfig } from "./useRead.js";

/** A write action, with the `.prepare` that plans it. */
export type PreparableAction = Action & { readonly prepare: Action };

/**
 * Plans a write without sending it: its steps, calls and warnings, for a review screen before
 * the wallet prompt.
 *
 * **When to use**
 *
 * Use to show what a write will do (how many transactions, approvals, warnings) and to disable
 * the submit button while it cannot be planned, e.g. when the account lacks permission.
 *
 * **Example** (Reviewing a records update)
 *
 * ```tsx
 * import { Actions } from "@ensforge/sdk"
 * import { usePrepare } from "@ensforge/react"
 *
 * function Review({ name, url }: { name: string; url: string }) {
 *   const { data: plan, error } = usePrepare(Actions.record.set, { name, texts: { url } })
 *   if (error) return <p>{error.message}</p>
 *   return <p>{plan?.steps.length} transaction(s)</p>
 * }
 * ```
 *
 * @category writes
 * @since 1.0.0
 */
export const usePrepare = <action extends PreparableAction>(
  action: action,
  options: ActionOptions<action["prepare"]> | undefined,
  config?: ReadConfig,
): ReadResult<Plan, ActionError<action["prepare"]>> =>
  useRead(action.prepare, options, config) as unknown as ReadResult<
    Plan,
    ActionError<action["prepare"]>
  >;
