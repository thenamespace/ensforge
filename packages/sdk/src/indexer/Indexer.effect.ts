/* oxlint-disable typescript/no-unsafe-type-assertion -- adapter methods are looked up by name at runtime, so their query and result types are erased */
import { Effect, Option, Stream } from "effect";

import type { AnyError } from "../errors/types.js";
import { complete } from "../internal/indexer/draft.js";
import { makeIndexer, methodNames } from "../internal/indexer/registry.js";
import type { Draft } from "./define.js";
import type { Indexer, Method, Methods } from "./Indexer.js";
import type { Page } from "./types.js";

/**
 * A custom adapter whose queries are Effects.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export type Adapter = { readonly id: string } & {
  readonly [method in Method]?: (
    query: Parameters<Methods[method]>[0],
    context: { readonly chainId: number },
  ) => Effect.Effect<Draft<ReturnType<Methods[method]>>, AnyError>;
};

/**
 * Builds an indexer from Effect functions; the Effect counterpart of `defineIndexer`.
 *
 * **When to use**
 *
 * Use when your adapter is written with Effect (an `HttpClient`, a cache, retries with
 * `Schedule`); interruption cancels its work.
 *
 * **Details**
 *
 * - Answers are completed as with `defineIndexer`: missing metadata gets its defaults and
 *   `indexer` is the adapter id.
 * - Fail with an ensforge error, e.g. `IndexerError` (`INDEXER_UNAVAILABLE`), so `fallback` can
 *   move on.
 *
 * **Example** (An Effect adapter)
 *
 * ```ts
 * import { Indexer } from "@ensforge/sdk/effect"
 * import { Effect } from "effect"
 *
 * const inHouse = Indexer.define({
 *   id: "in-house",
 *   getName: ({ name }) => Effect.promise(() => api.name(name)),
 * })
 * ```
 *
 * **Example** (With a fallback)
 *
 * ```ts
 * import { Ensforge } from "@ensforge/sdk"
 * import { bigname, fallback } from "@ensforge/sdk/indexer"
 *
 * const ens = Ensforge.create({ publicClient, indexer: fallback([inHouse, bigname()]) })
 * ```
 *
 * **Example** (A test double)
 *
 * ```ts
 * import { Indexer } from "@ensforge/sdk/effect"
 * import { Effect } from "effect"
 *
 * const indexer = Indexer.define({ id: "test", getName: () => Effect.succeed(null) })
 * ```
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export const define = (adapter: Adapter): Indexer => {
  const { id } = adapter;
  const methods: Record<string, unknown> = {};

  for (const method of methodNames) {
    const run = adapter[method] as
      | ((
          query: unknown,
          context: { readonly chainId: number },
        ) => Effect.Effect<unknown, AnyError>)
      | undefined;
    if (run === undefined) continue;

    methods[method] = (query: unknown, context: { readonly chainId: number }) =>
      run(query, context).pipe(Effect.flatMap((draft) => complete(method, draft as never, id)));
  }

  return makeIndexer({ id, methods });
};

/**
 * Streams every page of an indexer list, following `cursor` until the last page.
 *
 * **When to use**
 *
 * Use to walk a whole list (a name's subnames, an address's names) in an Effect program; take
 * only what you need with `Stream.take`.
 *
 * **Example** (Every subname of a name)
 *
 * ```ts
 * import { Actions, Indexer } from "@ensforge/sdk/effect"
 * import { Stream } from "effect"
 *
 * const pages = Indexer.paginate((cursor) =>
 *   Actions.indexer.getSubnames(ens, { name: "ens.eth", limit: 200, cursor }),
 * )
 * const names = yield* Stream.runCollect(pages)
 * ```
 *
 * **Example** (The first three pages)
 *
 * ```ts
 * import { Indexer } from "@ensforge/sdk/effect"
 * import { Stream } from "effect"
 *
 * const firstPages = Indexer.paginate(load).pipe(Stream.take(3))
 * ```
 *
 * **Example** (Items instead of pages)
 *
 * ```ts
 * import { Indexer } from "@ensforge/sdk/effect"
 * import { Stream } from "effect"
 *
 * const subnames = Indexer.paginate(load).pipe(
 *   Stream.flatMap((page) => Stream.fromIterable(page.items)),
 * )
 * ```
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export const paginate = <item, error, requirements>(
  load: (cursor: string | undefined) => Effect.Effect<Page<item>, error, requirements>,
): Stream.Stream<Page<item>, error, requirements> =>
  Stream.paginate(undefined as string | undefined, (cursor) =>
    load(cursor).pipe(
      Effect.map(
        (page) =>
          [
            [page],
            page.hasMore && page.cursor !== null ? Option.some(page.cursor) : Option.none(),
          ] as const,
      ),
    ),
  );
