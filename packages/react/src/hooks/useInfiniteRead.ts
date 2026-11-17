"use client";

import { useAtom } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";

import type { Ensforge } from "@ensforge/sdk";

import { ensPagesAtom, type PageAction } from "../atoms/pull.js";
import type { ActionError, ActionOptions, ActionValue } from "../atoms/types.js";
import { useEnsforgeContext } from "../provider/context.js";
import { errorOf } from "./result.js";

type ItemOf<page> = page extends { readonly items: readonly (infer item)[] } ? item : never;

/**
 * What {@link useInfiniteRead} returns.
 *
 * @category reads
 * @since 1.0.0
 */
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
 * starts it over once the indexer has caught up.
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
 * @category reads
 * @since 1.0.0
 */
export const useInfiniteRead = <action extends PageAction>(
  action: action,
  options: Omit<ActionOptions<action>, "cursor">,
  config: { readonly client?: Ensforge.Client | undefined } = {},
): InfiniteReadResult<ActionValue<action>, ActionError<action>> => {
  const { client } = useEnsforgeContext(config.client);
  const [result, pull] = useAtom(ensPagesAtom(client, action, options));
  const loaded = Option.getOrUndefined(AsyncResult.value(result));
  const pages = (loaded?.items ?? []) as readonly ActionValue<action>[];

  return {
    pages,
    items: pages.flatMap(
      (page) => (page as { readonly items: readonly ItemOf<ActionValue<action>>[] }).items,
    ),
    // The pull only learns the stream ended on the next pull; the last page already says so.
    // `paginate` always emits the first page, even an empty one, so the pull never ends empty.
    hasMore:
      loaded === undefined ||
      (!loaded.done &&
        (pages.at(-1) as { readonly hasMore?: boolean } | undefined)?.hasMore !== false),
    loadMore: () => pull(),
    isLoading: AsyncResult.isInitial(result) && result.waiting,
    isLoadingMore: !AsyncResult.isInitial(result) && result.waiting,
    error: errorOf(result) as ActionError<action> | undefined,
    result: result as unknown as InfiniteReadResult<
      ActionValue<action>,
      ActionError<action>
    >["result"],
  };
};
