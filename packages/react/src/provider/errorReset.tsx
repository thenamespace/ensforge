"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/** @internal Counts the resets; a failure thrown before the latest one is read again. */
export type ErrorResetStore = {
  epoch: number;
};

// Without a boundary, `reset` applies to every read in the app.
const globalStore: ErrorResetStore = { epoch: 0 };

const ErrorResetContext = createContext<ErrorResetStore>(globalStore);

/** @internal The store of the nearest `ReadErrorResetBoundary`, or the app-wide one. */
export const useErrorResetStore = (): ErrorResetStore => useContext(ErrorResetContext);

/**
 * What {@link ReadErrorResetBoundary} and {@link useReadErrorReset} give.
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export type ReadErrorReset = {
  /**
   * Makes the reads below read again the failures they threw to an error boundary. Call it when
   * the boundary resets; a failure is rethrown until then.
   */
  readonly reset: () => void;
};

const resetOf = (store: ErrorResetStore): ReadErrorReset => ({
  reset: () => {
    store.epoch += 1;
  },
});

/**
 * Props of {@link ReadErrorResetBoundary}.
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export type ReadErrorResetBoundaryProps = {
  /** The subtree, or a function of the reset handle for wiring it to an error boundary. */
  readonly children: ReactNode | ((reset: ReadErrorReset) => ReactNode);
};

/**
 * Scopes error resets of `useSuspenseRead`: a failure the reads below threw to an error boundary
 * is rethrown, from the cache, until `reset` is called; after that they read again. Place it
 * around the error boundary and call `reset` when that boundary resets. Like React Query's
 * `QueryErrorResetBoundary`.
 *
 * **When to use**
 *
 * Use with `useSuspenseRead` and an error boundary that can reset, so "try again" fetches again
 * instead of showing the cached error. Without a boundary `useReadErrorReset` resets every read
 * in the app.
 *
 * **Example** (Wiring an error boundary's reset)
 *
 * ```tsx
 * import { Component, Suspense, type ReactNode } from "react"
 * import { ReadErrorResetBoundary, useSuspenseRead } from "@ensforge/react"
 * import { Actions } from "@ensforge/sdk"
 *
 * // Any error boundary with a reset callback works, such as react-error-boundary's `onReset`.
 * class Boundary extends Component<{ children: ReactNode; onReset: () => void }, { failed: boolean }> {
 *   override state = { failed: false }
 *   static getDerivedStateFromError() {
 *     return { failed: true }
 *   }
 *   override render() {
 *     if (!this.state.failed) return this.props.children
 *     return (
 *       <button onClick={() => { this.props.onReset(); this.setState({ failed: false }) }}>
 *         Try again
 *       </button>
 *     )
 *   }
 * }
 *
 * function Owner({ name }: { name: string }) {
 *   const { data } = useSuspenseRead(Actions.name.get, { name })
 *   return <span>{data.owner}</span>
 * }
 *
 * export const View = ({ name }: { name: string }) => (
 *   <ReadErrorResetBoundary>
 *     {({ reset }) => (
 *       <Boundary onReset={reset}>
 *         <Suspense fallback="loading">
 *           <Owner name={name} />
 *         </Suspense>
 *       </Boundary>
 *     )}
 *   </ReadErrorResetBoundary>
 * )
 * ```
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export const ReadErrorResetBoundary = ({ children }: ReadErrorResetBoundaryProps) => {
  const [store] = useState<ErrorResetStore>(() => ({ epoch: 0 }));
  const [handle] = useState(() => resetOf(store));

  return (
    <ErrorResetContext.Provider value={store}>
      {typeof children === "function" ? children(handle) : children}
    </ErrorResetContext.Provider>
  );
};

/**
 * The reset handle of the nearest {@link ReadErrorResetBoundary}, or of the whole app without
 * one. Call `reset` from an error boundary's reset callback so `useSuspenseRead` reads again.
 *
 * **Example** (Resetting from a boundary component)
 *
 * ```tsx
 * import { useReadErrorReset } from "@ensforge/react"
 *
 * export function RetryButton({ onRetry }: { onRetry: () => void }) {
 *   const { reset } = useReadErrorReset()
 *   return <button onClick={() => { reset(); onRetry() }}>Try again</button>
 * }
 * ```
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export const useReadErrorReset = (): ReadErrorReset => {
  const store = useErrorResetStore();
  const [handle] = useState(() => resetOf(store));
  return handle;
};
