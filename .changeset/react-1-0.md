---
"@ensforge/react": major
---

ensforge 1.0: React hooks and Effect Atom atoms for the 1.0 SDK. `useRead`, `useSuspenseRead`, `useReads`, `useInfiniteRead`, `usePrepare` and `useWrite` take any SDK action (failed suspense reads retry through `ReadErrorResetBoundary`), with named presets such as `useAddress` and `useSetRecords`. Reads are shared and cached, cancel on unmount and refresh after writes (chain reads once mined, indexer reads once indexed). Server rendering with `prefetch`, `dehydrate` (including streaming) and `HydrationBoundary` works with the Next.js App and Pages routers, React Router, Remix and TanStack Start. React 19 is required. The 0.x hooks, atoms and cache helpers are removed.
