import { Effect } from "effect";

import { adapterError, complete } from "../internal/indexer/draft.js";
import { makeIndexer, methodNames, type Implementation } from "../internal/indexer/registry.js";
import type { Context, Indexer, Method, Methods } from "./Indexer.js";
import type { Meta } from "./types.js";

/**
 * What an adapter returns for an answer type: the answer, with every {@link Meta} field optional.
 * ensforge fills the missing ones (`completeness: "full"`, no snapshot) and sets `indexer` to the
 * adapter id.
 *
 * @category indexer
 * @since 1.0.0
 */
export type Draft<answer> = answer extends null ? null : Omit<answer, keyof Meta> & Partial<Meta>;

/**
 * A custom adapter: an id and the queries it answers, as Promise functions.
 *
 * @category indexer
 * @since 1.0.0
 */
export type Adapter = { readonly id: string } & {
  readonly [method in Method]?: (
    query: Parameters<Methods[method]>[0],
    context: Context,
  ) => Promise<Draft<ReturnType<Methods[method]>>>;
};

/**
 * Builds an indexer from your own functions, e.g. for an in-house API or a test double.
 *
 * **When to use**
 *
 * Use when your data source does not speak bigname's REST API; for one that does (a self-hosted
 * bigname, a proxy), pass its URL to `bigname({ url })` instead.
 *
 * **Details**
 *
 * - Implement only the queries you serve; the others fail with `INDEXER_UNSUPPORTED`, so
 *   `fallback` moves on to the next indexer.
 * - Queries arrive validated: names normalized, addresses checksummed, the namespace resolved.
 * - Return `null` from single-resource queries (`getName`, `getRecords`, …) when nothing exists.
 * - Throw an ensforge error (e.g. `Errors.IndexerError`) to control how a failure is reported;
 *   anything else becomes `INDEXER_UNAVAILABLE`.
 *
 * **Example** (An adapter for an in-house API)
 *
 * ```ts
 * import { defineIndexer } from "@ensforge/sdk/indexer"
 *
 * const inHouse = defineIndexer({
 *   id: "in-house",
 *   getSubnames: async ({ name, cursor }, { signal }) => {
 *     const page = await api.subnames(name, cursor, { signal })
 *     return { items: page.items, cursor: page.next, hasMore: page.next !== null, totalCount: null }
 *   },
 * })
 * ```
 *
 * **Example** (Trying it before bigname)
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
 * import { defineIndexer } from "@ensforge/sdk/indexer"
 *
 * const indexer = defineIndexer({
 *   id: "test",
 *   getName: async ({ name }) => (name === "nick.eth" ? fixture : null),
 * })
 * ```
 *
 * @category indexer
 * @since 1.0.0
 */
export const defineIndexer = (adapter: Adapter): Indexer => {
  const { id } = adapter;
  const methods: Record<string, unknown> = {};

  for (const method of methodNames) {
    const run = adapter[method] as
      | ((query: unknown, context: Context) => Promise<unknown>)
      | undefined;
    if (run === undefined) continue;

    methods[method] = (query: unknown, context: { readonly chainId: number }) =>
      Effect.tryPromise({
        try: (signal) => run.call(adapter, query, { chainId: context.chainId, signal }),
        catch: (cause) => adapterError(id, method, cause),
      }).pipe(Effect.flatMap((draft) => complete(method, draft as never, id)));
  }

  return makeIndexer({ id, methods: methods as Implementation["methods"] });
};
