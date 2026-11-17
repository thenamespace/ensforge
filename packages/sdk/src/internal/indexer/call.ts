import { Effect } from "effect";

import type { Client } from "../../client/types.js";
import { ConfigError } from "../../errors/classes/ConfigError.js";
import { IndexerError } from "../../errors/classes/IndexerError.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../errors/types.js";
import type { Method, Methods } from "../../indexer/Indexer.js";
import { implementationOf } from "./registry.js";

/** Runs one query on the client's indexer. */
export const callIndexer = <method extends Method>(
  client: Client,
  method: method,
  query: Parameters<Methods[method]>[0],
): Effect.Effect<ReturnType<Methods[method]>, AnyError> => {
  const { indexer } = client.config;
  if (indexer === undefined) {
    return Effect.fail(new ConfigError({ code: "INDEXER_NOT_CONFIGURED" }));
  }

  const implementation = implementationOf(indexer);
  if (implementation === undefined) {
    return Effect.fail(
      new ConfigError({
        code: "INDEXER_NOT_CONFIGURED",
        shortMessage: "The configured indexer was not built by ensforge.",
        hint: "Create it with bigname(), goldsky(), fallback() or defineIndexer().",
      }),
    );
  }

  const run = implementation.methods[method];
  if (run === undefined) {
    return Effect.fail(
      new IndexerError({
        code: "INDEXER_UNSUPPORTED",
        source: implementation.id,
        shortMessage: `${implementation.id} does not support ${method}.`,
      }),
    );
  }
  return run(query, { chainId: client.chain.id });
};

/** `null` as is, or `NotFoundError` (`INDEXER_NOT_FOUND`) with `strict`. */
export const orNotFound = <value>(
  result: value | null,
  strict: boolean | undefined,
  resource: string,
): Effect.Effect<value | null, NotFoundError> =>
  result === null && strict === true
    ? Effect.fail(new NotFoundError({ code: "INDEXER_NOT_FOUND", resource }))
    : Effect.succeed(result);
