import { Clock, Effect } from "effect";

import { IndexerError } from "../../errors/classes/IndexerError.js";
import type { NotFoundError } from "../../errors/classes/NotFoundError.js";
import type { Namespace } from "../../indexer/types.js";
import { send, type HttpConfig } from "./http.js";
import * as Wire from "./wire.js";

type Cached<value> = { readonly at: number; readonly value: value };

/**
 * What one REST indexer serves, read lazily from `/status` (chains with an indexed head) and
 * `/namespaces/{ns}` (each namespace's networks), and cached.
 */
export const capabilities = (config: HttpConfig) => {
  let chains: Cached<ReadonlySet<number> | undefined> | undefined;
  const networks = new Map<Namespace, Cached<readonly number[] | undefined>>();

  // `undefined` when the server has no `/status` (a minimal compatible server): not checked.
  const indexedChains = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    // Cached for five minutes.
    if (chains !== undefined && now - chains.at < 5 * 60_000) return chains.value;

    const route = "/status";
    const value = yield* send(config, { route, path: route }).pipe(
      Effect.flatMap((body) =>
        Wire.decode(Wire.envelope(Wire.StatusData), body, { id: config.id, route }),
      ),
      Effect.map(
        ({ data }) =>
          new Set(
            Object.entries(data.chains)
              .filter(
                ([, chain]) => chain.indexed_block !== null && chain.indexed_block !== undefined,
              )
              .map(([chainId]) => Number(chainId)),
          ) as ReadonlySet<number>,
      ),
      Effect.catchTag("NotFoundError", () => Effect.undefined),
    );
    chains = { at: now, value };
    return value;
  });

  // `undefined` when the indexer does not know the namespace.
  const namespaceChains = Effect.fnUntraced(function* (namespace: Namespace) {
    const cached = networks.get(namespace);
    const now = yield* Clock.currentTimeMillis;
    // Cached for an hour.
    if (cached !== undefined && now - cached.at < 60 * 60_000) return cached.value;

    const route = "/namespaces/{namespace}";
    const value = yield* send(config, { route, path: `/namespaces/${namespace}` }).pipe(
      Effect.flatMap((body) =>
        Wire.decode(Wire.envelope(Wire.Namespace), body, { id: config.id, route }),
      ),
      Effect.map(({ data }) => {
        const ids = (data.networks ?? []).flatMap((network) =>
          network.chain_id === null || network.chain_id === undefined ? [] : [network.chain_id],
        );
        // Basenames live on Base (8453) when the indexer does not list the networks.
        return ids.length > 0 ? ids : namespace === "basenames" ? [8453] : [];
      }),
      Effect.catchTag("NotFoundError", () => Effect.undefined),
    );
    networks.set(namespace, { at: now, value });
    return value;
  });

  const unsupported = (shortMessage: string) =>
    Effect.fail(new IndexerError({ code: "INDEXER_UNSUPPORTED", source: config.id, shortMessage }));

  /**
   * Checks that the indexer serves `namespace` for a client on `clientChainId`, and returns the
   * namespace's chain (where its answers are read). ENS must be served on the client's own chain,
   * so an indexer for another network is never used by mistake. The probe's own failures
   * (unavailable, rate limited) fail the query, so `fallback` moves on.
   */
  const serve = Effect.fnUntraced(function* (
    namespace: Namespace,
    clientChainId: number,
  ): Effect.fn.Return<number, IndexerError | NotFoundError> {
    // A server without `/namespaces` is assumed to serve ENS on the client's chain.
    const declared =
      (yield* namespaceChains(namespace)) ?? (namespace === "ens" ? [clientChainId] : undefined);
    if (declared === undefined || declared.length === 0) {
      return yield* unsupported(`${config.id} does not serve the ${namespace} namespace.`);
    }
    if (namespace === "ens" && !declared.includes(clientChainId)) {
      return yield* unsupported(
        `${config.id} serves ENS on chain ${declared.join(", ")}, but the client is on chain ${clientChainId}.`,
      );
    }

    // A namespace's home chains are those other than the client's (Basenames: Base); ENS
    // itself is served on the client's chain.
    const indexed = yield* indexedChains;
    const own = declared.filter((id) => id !== clientChainId);
    const home = namespace === "ens" || own.length === 0 ? [clientChainId] : own;
    const chainId = home[0] as number;
    if (indexed !== undefined && !home.every((id) => indexed.has(id))) {
      return yield* unsupported(
        `${config.id} does not index ${namespace} yet (chain ${home.join(", ")}).`,
      );
    }
    return chainId;
  });

  return { serve };
};
