import type { Page } from "./types.js";

/**
 * Iterates over every page of an indexer list, following `cursor` until the last page.
 *
 * **When to use**
 *
 * Use to walk a whole list, such as a name's subnames or an address's names; `break` stops
 * requesting further pages.
 *
 * **Example** (Every subname of a name)
 *
 * ```ts
 * import { paginate } from "@ensforge/sdk/indexer"
 *
 * for await (const page of paginate(ens.indexer.getSubnames, { name: "ens.eth", limit: 200 })) {
 *   render(page.items)
 * }
 * ```
 *
 * **Example** (Collecting names, at most 1,000)
 *
 * ```ts
 * import { paginate } from "@ensforge/sdk/indexer"
 *
 * const names: string[] = []
 * for await (const page of paginate(ens.indexer.getNamesForAddress, { address })) {
 *   names.push(...page.items.map((item) => item.name))
 *   if (names.length >= 1000) break
 * }
 * ```
 *
 * **Example** (With a standalone action)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 * import { paginate } from "@ensforge/sdk/indexer"
 *
 * const pages = paginate(
 *   (options: Actions.indexer.getSubnames.Options) => Actions.indexer.getSubnames(ens, options),
 *   { name: "ens.eth" },
 * )
 * ```
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export async function* paginate<options extends { cursor?: string | undefined }, item>(
  load: (options: options) => Promise<Page<item>>,
  options: options,
): AsyncGenerator<Page<item>, void, undefined> {
  let cursor = options.cursor;
  for (;;) {
    // Pages depend on the previous cursor, so they load one at a time.
    // oxlint-disable-next-line no-await-in-loop
    const page = await load({ ...options, cursor });
    yield page;
    if (!page.hasMore || page.cursor === null) return;
    cursor = page.cursor;
  }
}
