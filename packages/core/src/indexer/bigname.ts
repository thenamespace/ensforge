import { makeIndexer } from "../internal/indexer/registry.js";
import { restIndexer } from "../internal/indexer/rest.js";
import type { Indexer } from "./Indexer.js";

/**
 * Connection options shared by the built-in REST indexers.
 *
 * @category indexer
 * @since 1.0.0
 */
export type RestIndexerOptions = {
  /**
   * Base URL of a server with the same API (self-hosted, a proxy). A version path (`/v1`) is
   * added unless the URL ends with one.
   *
   * @default the public host for the client's chain
   */
  url?: string | undefined;
  /** Extra request headers, e.g. an API key. */
  headers?: Readonly<Record<string, string>> | undefined;
  /** `fetch` to send requests with. @default globalThis.fetch */
  fetch?: typeof fetch | undefined;
  /** Milliseconds per request before it is retried or fails. @default 15_000 */
  timeout?: number | undefined;
  /**
   * Retries of rate-limited, unavailable and timed-out requests; `Retry-After` is honoured.
   *
   * @default 2
   */
  retryCount?: number | undefined;
};

/**
 * The bigname indexer (`api.bigname.sh`), the indexer the ENS app uses.
 *
 * **When to use**
 *
 * Use for ENS names on mainnet and Sepolia: ENSv1 and ENSv2 state, records, subnames, history,
 * permissions, and verified (on-chain) records and primary names.
 *
 * **Details**
 *
 * - Public hosts: `https://api.bigname.sh` (mainnet) and `https://sepolia.api.bigname.sh`
 *   (Sepolia); other chains need `url`.
 * - Answers can be pinned to a snapshot (`at`) and read at `safe` or `finalized` finality.
 * - What it serves is read from its `/status` and `/namespaces` routes on first use: a client on
 *   another chain, or a namespace it does not index yet (Basenames, at the time of writing),
 *   fails with `INDEXER_UNSUPPORTED`, so `fallback` moves on.
 * - `cache: true` revalidates repeated reads with ETags.
 *
 * **Example** (Mainnet or Sepolia)
 *
 * ```ts
 * import { bigname } from "@ensforge/core/indexer"
 *
 * const ens = Ensforge.create({ publicClient, indexer: bigname() }).extend(indexerActions())
 * ```
 *
 * **Example** (A self-hosted bigname)
 *
 * ```ts
 * const indexer = bigname({ url: "https://bigname.internal", headers: { authorization } })
 * ```
 *
 * **Example** (With Goldsky for Basenames)
 *
 * ```ts
 * import { bigname, fallback, goldsky } from "@ensforge/core/indexer"
 *
 * const indexer = fallback([bigname(), goldsky()])
 * ```
 *
 * @category indexer
 * @since 1.0.0
 */
export const bigname = (
  options: RestIndexerOptions & {
    /** Revalidate repeated reads with ETags. @default false */
    cache?: boolean | undefined;
  } = {},
): Indexer =>
  makeIndexer(
    restIndexer({
      ...options,
      id: "bigname",
      version: "/v1",
      hosts: { 1: "https://api.bigname.sh", 11155111: "https://sepolia.api.bigname.sh" },
      features: { snapshots: true, finality: true, resolversByRoleHolder: true },
    }),
  );
