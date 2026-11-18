"use client";

import { useContext } from "react";

import { RegistryContext, useAtomRefresh, useAtomSuspense } from "@effect/atom-react";
import { Cause, Effect } from "effect";
import { AsyncResult, AtomRegistry } from "effect/reactivity";

import { ensAtom } from "../atoms/read.js";
import { isServer, serverReads } from "../atoms/runtime.js";
import type { Action, ActionOptions, ActionValue } from "../atoms/types.js";
import { useEnsforgeContext } from "../provider/context.js";
import { useErrorResetStore } from "../provider/errorReset.js";
import type { ReadConfig } from "./useRead.js";

/**
 * What {@link useSuspenseRead} returns: the value is always there.
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export type SuspenseReadResult<value> = {
  readonly data: value;
  /** Loading again with the current value shown. */
  readonly isRefreshing: boolean;
  readonly refresh: () => void;
};

// Failures this hook has thrown to an error boundary.
// The reset count when each was first thrown: a React retry before the boundary commits sees
// the same count and throws again; only a `reset` since moves a failure on.
const thrown = new WeakMap<AsyncResult.Failure<unknown, unknown>, number>();

/**
 * Reads with an action and suspends until the value is there; failures throw to the nearest
 * error boundary.
 *
 * **When to use**
 *
 * Use inside `<Suspense>` boundaries, including server-rendered pages whose reads were
 * prefetched.
 *
 * **Details**
 *
 * - A failure is cached and thrown again until `reset` (`useReadErrorReset`, or
 *   `ReadErrorResetBoundary`) is called, which an error boundary's reset does; the read then runs
 *   again.
 * - On the server, a read that was not prefetched throws, so React renders the boundary's
 *   fallback there and the read in the browser (React reports it as a recoverable error).
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
 * @stability stable
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
  const registry = useContext(RegistryContext);
  const atom = ensAtom(client, action, options, { ...defaults, ...freshness });
  if (isServer && !registry.get(serverReads) && AsyncResult.isInitial(registry.get(atom))) {
    throw new Error(`${action.path} was not prefetched: it renders in the browser.`);
  }
  let result = useAtomSuspense(atom, { includeFailure: true });
  const refresh = useAtomRefresh(atom);

  // A failure stays cached and is rethrown until `reset` was called after it was thrown.
  const resets = useErrorResetStore();
  const thrownAt = AsyncResult.isFailure(result) ? thrown.get(result) : undefined;
  if (
    AsyncResult.isFailure(result) &&
    !result.waiting &&
    thrownAt !== undefined &&
    thrownAt < resets.epoch
  ) {
    registry.refresh(atom);
    // Suspense settled the read, so the registry holds a success or failure again.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    result = registry.get(atom) as typeof result;
  }
  if (AsyncResult.isFailure(result)) {
    if (result.waiting) {
      throw Effect.runPromise(
        AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }).pipe(Effect.ignore),
      );
    }
    if (!thrown.has(result)) thrown.set(result, resets.epoch);
    throw Cause.squash(result.cause);
  }

  return { data: result.value, isRefreshing: result.waiting, refresh };
};
