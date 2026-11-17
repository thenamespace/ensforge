export { EnsforgeProvider, type EnsforgeProviderProps } from "./provider/EnsforgeProvider.js";
export { useEnsforge } from "./provider/context.js";

export type { ReadResult } from "./hooks/result.js";
export { useRead, type ReadConfig } from "./hooks/useRead.js";
export { useSuspenseRead, type SuspenseReadResult } from "./hooks/useSuspenseRead.js";
export { useReads, type ReadSpec, type ReadsResult } from "./hooks/useReads.js";
export { useInfiniteRead, type InfiniteReadResult } from "./hooks/useInfiniteRead.js";
export { usePrepare, type PreparableAction } from "./hooks/usePrepare.js";
export { useWrite, type WriteResult } from "./hooks/useWrite.js";
export * from "./hooks/named/reads.js";
export * from "./hooks/named/writes.js";

export * from "./atoms/index.js";
// Loads server-rendered reads (`dehydrate` from `@ensforge/react/server`) into the registry.
export { HydrationBoundary } from "@effect/atom-react";
