import { Effect } from "effect";

import { IndexerError } from "../../errors/classes/IndexerError.js";
import type { NotFoundError } from "../../errors/classes/NotFoundError.js";
import type { Namespace } from "../../indexer/types.js";
import { send, type HttpConfig } from "./http.js";
import * as Wire from "./wire.js";

const statusTtl = 5 * 60_000;
const namespaceTtl = 60 * 60_000;

/** Base chain of Basenames; used when an indexer does not list the namespace's networks. */
const basenamesChainId = 8453;

type Cached<value> = { readonly at: number; readonly value: value };

/**
 * What one REST indexer serves, read lazily from `/status` (chains with an indexed head) and
 * `/namespaces/{ns}` (each namespace's networks), and cached.
 */
export const capabilities = (config: HttpConfig) => {
  let chains: Cached<ReadonlySet<number>> | undefined;
  const networks = new Map<Namespace, Cached<readonly number[] | undefined>>();

  const indexedChains = Effect.gen(function* () {
    if (chains !== undefined && Date.now() - chains.at < statusTtl) return chains.value;

    const route = "/status";
    const body = yield* send(config, { route, path: route });
    const { data } = yield* Wire.decode(Wire.envelope(Wire.Status), body, { id: config.id, route });
    const value = new Set(
      Object.entries(data.chains)
        .filter(([, chain]) => chain.indexed_block !== null && chain.indexed_block !== undefined)
        .map(([chainId]) => Number(chainId)),
    );
    chains = { at: Date.now(), value };
    return value;
  });

  // `undefined` when the indexer does not know the namespace.
  const namespaceChains = (namespace: Namespace) =>
    Effect.gen(function* () {
      const cached = networks.get(namespace);
      if (cached !== undefined && Date.now() - cached.at < namespaceTtl) return cached.value;

      const route = "/namespaces/{namespace}";
      const value = yield* send(config, { route, path: `/namespaces/${namespace}` }).pipe(
        Effect.flatMap((body) =>
          Wire.decode(Wire.envelope(Wire.Namespace), body, { id: config.id, route }),
        ),
        Effect.map(({ data }) => {
          const ids = (data.networks ?? []).flatMap((network) =>
            network.chain_id === null || network.chain_id === undefined ? [] : [network.chain_id],
          );
          return ids.length > 0 ? ids : namespace === "basenames" ? [basenamesChainId] : [];
        }),
        Effect.catchTag("NotFoundError", () => Effect.succeed(undefined)),
      );
      networks.set(namespace, { at: Date.now(), value });
      return value;
    });

  const unsupported = (shortMessage: string) =>
    Effect.fail(new IndexerError({ code: "INDEXER_UNSUPPORTED", source: config.id, shortMessage }));

  /**
   * Checks that the indexer serves `namespace` for a client on `clientChainId`, and returns the
   * namespace's chain (where its answers are read). ENS must be served on the client's own chain,
   * so an indexer for another network is never used by mistake.
   */
  const serve = (
    namespace: Namespace,
    clientChainId: number,
  ): Effect.Effect<number, IndexerError | NotFoundError> =>
    Effect.gen(function* () {
      const declared = yield* namespaceChains(namespace);
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
      if (!home.every((id) => indexed.has(id))) {
        return yield* unsupported(
          `${config.id} does not index ${namespace} yet (chain ${home.join(", ")}).`,
        );
      }
      return chainId;
    });

  return { serve };
};
