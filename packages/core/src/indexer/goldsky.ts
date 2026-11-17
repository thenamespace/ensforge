import { makeIndexer } from "../internal/indexer/registry.js";
import { restIndexer } from "../internal/indexer/rest.js";
import type { RestIndexerOptions } from "./bigname.js";
import type { Indexer } from "./Indexer.js";

/**
 * Goldsky's ENS indexer (`ens-api.goldsky.com`), which serves bigname's API for ENS and
 * Basenames.
 *
 * **When to use**
 *
 * Use for Basenames (`*.base.eth`), or as a second indexer behind bigname on mainnet.
 *
 * **Details**
 *
 * - Mainnet only (ENS on chain 1, Basenames on Base); other chains need `url`.
 * - Reads the latest state only: `at` and `finality: "safe" | "finalized"` fail with
 *   `INDEXER_UNSUPPORTED`, as does `getResolvers`.
 * - Answers carry fewer fields than bigname's (no verified records, subnames without expiry);
 *   missing fields are `null`.
 *
 * **Example** (Basenames)
 *
 * ```ts
 * import { goldsky } from "@ensforge/core/indexer"
 *
 * const ens = Ensforge.create({ publicClient, indexer: goldsky() }).extend(indexerActions())
 * const name = await ens.indexer.getName({ name: "jesse.base.eth" })
 * ```
 *
 * **Example** (Behind bigname)
 *
 * ```ts
 * const indexer = fallback([bigname(), goldsky()])
 * ```
 *
 * **Example** (With an API key header)
 *
 * ```ts
 * const indexer = goldsky({ headers: { "x-api-key": key } })
 * ```
 *
 * @category indexer
 * @since 1.0.0
 */
export const goldsky = (options: RestIndexerOptions = {}): Indexer =>
  makeIndexer(
    restIndexer({
      ...options,
      id: "goldsky",
      version: "/v2",
      hosts: { 1: "https://ens-api.goldsky.com" },
      features: { snapshots: false, finality: false, resolversByRoleHolder: false },
    }),
  );
