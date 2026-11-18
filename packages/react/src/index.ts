export { EnsforgeProvider, type EnsforgeProviderProps } from "./provider/EnsforgeProvider.js";
export { useEnsforge } from "./provider/context.js";

// Exposes effect/reactivity's AsyncResult on purpose (see `ReadResult`).
// oxlint-disable-next-line effecttsgo/api-stability-leak
export type { ReadResult } from "./hooks/result.js";
export { useRead, type ReadConfig } from "./hooks/useRead.js";
export { useSuspenseRead, type SuspenseReadResult } from "./hooks/useSuspenseRead.js";
export {
  ReadErrorResetBoundary,
  useReadErrorReset,
  type ReadErrorReset,
  type ReadErrorResetBoundaryProps,
} from "./provider/errorReset.js";
export { useReads, type ReadSpec, type ReadsResult } from "./hooks/useReads.js";
// Exposes effect/reactivity's AsyncResult on purpose (see `ReadResult`).
// oxlint-disable-next-line effecttsgo/api-stability-leak
export { useInfiniteRead, type InfiniteReadResult } from "./hooks/useInfiniteRead.js";
export { usePrepare, type PreparableAction } from "./hooks/usePrepare.js";
// Exposes effect/reactivity's AsyncResult on purpose (see `ReadResult`).
// oxlint-disable-next-line effecttsgo/api-stability-leak
export { useWrite, type WriteResult } from "./hooks/useWrite.js";
export * from "./hooks/named/reads.js";
export * from "./hooks/named/writes.js";

export * from "./atoms/index.js";
/**
 * Loads server-rendered reads (`dehydrate` from `@ensforge/react/server`) into the registry.
 * Re-exported from `@effect/atom-react`.
 *
 * @stability unstable
 */
export { HydrationBoundary } from "@effect/atom-react";
