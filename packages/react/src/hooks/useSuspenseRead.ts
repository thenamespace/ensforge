"use client";

import { useAtomRefresh, useAtomSuspense } from "@effect/atom-react";

import { ensAtom } from "../atoms/read.js";
import type { Action, ActionOptions, ActionValue } from "../atoms/types.js";
import { useEnsforgeContext } from "../provider/context.js";
import type { ReadConfig } from "./useRead.js";

/**
 * What {@link useSuspenseRead} returns: the value is always there.
 *
 * @category reads
 * @since 1.0.0
 */
export type SuspenseReadResult<value> = {
  readonly data: value;
  /** Loading again with the current value shown. */
  readonly isRefreshing: boolean;
  readonly refresh: () => void;
};

/**
 * Reads with an action and suspends until the value is there; failures throw to the nearest
 * error boundary.
 *
 * **When to use**
 *
 * Use inside `<Suspense>` boundaries, including server-rendered pages whose reads were
 * prefetched.
 *
 * **Example** (A profile behind Suspense)
 *
 * ```tsx
 * import { Actions } from "@ensforge/sdk"
 * import { useSuspenseRead } from "@ensforge/react"
 *
 * function Url({ name }: { name: string }) {
 *   const { data } = useSuspenseRead(Actions.record.getText, { name, key: "url" })
 *   return <a href={data ?? "#"}>{data}</a>
 * }
 * ```
 *
 * @category reads
 * @since 1.0.0
 */
export const useSuspenseRead = <action extends Action>(
  action: action,
  options: ActionOptions<action>,
  config: Omit<ReadConfig, "enabled"> = {},
): SuspenseReadResult<ActionValue<action>> => {
  const { client: own, ...freshness } = config;
  const { client, defaults } = useEnsforgeContext(own);
  const atom = ensAtom(client, action, options, { ...defaults, ...freshness });
  const result = useAtomSuspense(atom);
  const refresh = useAtomRefresh(atom);

  return { data: result.value, isRefreshing: result.waiting, refresh };
};
