import { Array as Arr, Struct } from "effect";
import { Hydration, type AtomRegistry } from "effect/reactivity";

/**
 * Prefetched reads of `registry` as plain data for `<HydrationBoundary state={…}>`.
 *
 * **Details**
 *
 * - Values are JSON (bigints and bytes are tagged), so they pass through server components and
 *   loaders. Entries carry no `undefined` fields, so the result can be returned directly from
 *   Next.js `getServerSideProps` and `getStaticProps`.
 * - `streaming: true` also sends reads still loading, as promises that resolve on the client
 *   (React 19 server components, streaming SSR).
 *
 * **Example** (Streaming reads that are still loading)
 *
 * ```tsx
 * import { Actions } from "@ensforge/sdk"
 * import { HydrationBoundary } from "@ensforge/react"
 * import { dehydrate, prefetch } from "@ensforge/react/server"
 * import { AtomRegistry } from "effect/reactivity"
 *
 * const registry = AtomRegistry.make()
 * void prefetch(registry, ens, Actions.indexer.getSubnames, { name: "ens.eth" })
 * const state = dehydrate(registry, { streaming: true })
 * ```
 *
 * @stability unstable
 * @category server
 * @since 1.0.0
 */
export const dehydrate = (
  registry: AtomRegistry.AtomRegistry,
  options: { readonly streaming?: boolean | undefined } = {},
): readonly Hydration.DehydratedAtom[] =>
  Arr.map(
    Hydration.toValues(
      Hydration.dehydrate(registry, {
        encodeInitialAs: options.streaming === true ? "promise" : "ignore",
      }),
    ),
    // `Hydration.dehydrate` sets `resultPromise: undefined` on settled reads, which Next.js props reject.
    (entry) => (entry.resultPromise === undefined ? Struct.omit(entry, ["resultPromise"]) : entry),
  );
