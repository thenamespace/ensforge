"use client";

import { useAtom } from "@effect/atom-react";
import { Array as Arr, Option } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";

import type { Ensforge } from "@ensforge/sdk";

import { ensPagesAtom, type PageAction, type PagesAtom } from "../atoms/pull.js";
import type { ActionError, ActionOptions, ActionValue } from "../atoms/types.js";
import { useEnsforgeContext } from "../provider/context.js";
import { errorOf } from "./result.js";

const idle: PagesAtom<never, never> = Atom.writable(
  () => AsyncResult.initial(false),
  () => undefined,
);

type ItemOf<page> = page extends { readonly items: readonly (infer item)[] } ? item : never;

/**
 * What {@link useInfiniteRead} returns.
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
// `result` is effect/reactivity's AsyncResult: unstable upstream, exposed on purpose for 1.0.
// oxlint-disable-next-line effecttsgo/api-stability-leak
export type InfiniteReadResult<page, error> = {
  /** Every page loaded so far. */
  readonly pages: readonly page[];
  /** The items of every page loaded so far, in order. */
  readonly items: readonly ItemOf<page>[];
  /** More pages remain. */
  readonly hasMore: boolean;
  /** Loads the next page. */
  readonly loadMore: () => void;
  /** The first page is loading. */
  readonly isLoading: boolean;
  /** A further page is loading. */
  readonly isLoadingMore: boolean;
  readonly error: error | undefined;
  readonly result: AsyncResult.AsyncResult<
    { readonly done: boolean; readonly items: readonly page[] },
    error
  >;
};

/**
 * Reads an indexer list page by page, such as a name's subnames or an account's names.
 *
 * **When to use**
 *
 * Use for "load more" lists and infinite scroll. A write touching the list's name or account
 * starts it over once the indexer has caught up. Pass `undefined` options (or `enabled: false`)
 * to wait, e.g. until a name is typed.
 *
 * **Example** (Subnames with "Load more")
 *
 * ```tsx
 * import { Actions } from "@ensforge/sdk"
 * import { useInfiniteRead } from "@ensforge/react"
 *
 * function Subnames({ name }: { name: string }) {
 *   const { items, hasMore, loadMore } = useInfiniteRead(Actions.indexer.getSubnames, { name })
 *   return (
 *     <>
 *       {items.map((item) => <p key={item.name}>{item.name}</p>)}
 *       {hasMore && <button onClick={loadMore}>Load more</button>}
 *     </>
 *   )
 * }
 * ```
 *
 * @stability stable
 * @category reads
 * @since 1.0.0
 */
export const useInfiniteRead = <action extends PageAction>(
  action: action,
  options: Omit<ActionOptions<action>, "cursor"> | undefined,
  config: {
    /**
     * Load the list. Passing `undefined` options also disables it.
     *
     * @default true
     */
    readonly enabled?: boolean | undefined;
    readonly client?: Ensforge.Client | undefined;
  } = {},
): InfiniteReadResult<ActionValue<action>, ActionError<action>> => {
  const { enabled = true, client: own } = config;
  const { client } = useEnsforgeContext(own);
  const atom = enabled && options !== undefined ? ensPagesAtom(client, action, options) : idle;
  const [result, pull] = useAtom(atom);
  const loaded = Option.getOrUndefined(AsyncResult.value(result));
  // Pages of a paginated action are the action's value; `PageAction` erases that.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const pages = (loaded?.items ?? []) as readonly ActionValue<action>[];

  return {
    pages,
    items: Arr.flatMap(
      pages,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      (page) => (page as { readonly items: readonly ItemOf<ActionValue<action>>[] }).items,
    ),
    // The pull only learns the stream ended on the next pull; the last page already says so.
    // `paginate` always emits the first page, even an empty one, so the pull never ends empty.
    hasMore:
      loaded === undefined
        ? atom !== idle
        : !loaded.done &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          (pages.at(-1) as { readonly hasMore?: boolean } | undefined)?.hasMore !== false,
    loadMore: () => pull(),
    isLoading: AsyncResult.isInitial(result) && result.waiting,
    isLoadingMore: !AsyncResult.isInitial(result) && result.waiting,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    error: errorOf(result) as ActionError<action> | undefined,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    result: result as unknown as InfiniteReadResult<
      ActionValue<action>,
      ActionError<action>
    >["result"],
  };
};
