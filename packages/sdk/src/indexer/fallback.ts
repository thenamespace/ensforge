import { Effect } from "effect";

import { IndexerError } from "../errors/classes/IndexerError.js";
import type { AnyError } from "../errors/types.js";
import {
  implementationOf,
  makeIndexer,
  methodNames,
  type CallContext,
  type Implementation,
} from "../internal/indexer/registry.js";
import type { Indexer, Method } from "./Indexer.js";

/**
 * Failures after which `fallback` asks the next indexer.
 *
 * @category indexer
 * @since 1.0.0
 */
export type FallbackReason = "unavailable" | "rateLimited" | "unsupported" | "behind";

const reasons: Readonly<Record<string, FallbackReason>> = {
  INDEXER_UNAVAILABLE: "unavailable",
  INDEXER_RATE_LIMITED: "rateLimited",
  INDEXER_UNSUPPORTED: "unsupported",
  INDEXER_BEHIND: "behind",
};

// Cursors and snapshot tokens are tagged with the index of the indexer that issued them, so a
// follow-up goes back to it: another indexer cannot read them.
const tagPattern = /^f(\d+):(.*)$/s;
const tag = (index: number, value: string | null): string | null =>
  value === null ? null : `f${index}:${value}`;

const untag = (value: string | undefined): { index: number; value: string } | undefined => {
  const match = value === undefined ? null : tagPattern.exec(value);
  return match === null ? undefined : { index: Number(match[1]), value: match[2] as string };
};

type Query = { readonly cursor?: string; readonly at?: { readonly token?: string } };

/** The indexer a cursor or `at.token` came from, and the query with them untagged. */
const pinned = (query: Query) => {
  const cursor = untag(query.cursor);
  const token = untag(query.at?.token);
  const index = cursor?.index ?? token?.index;
  if (index === undefined) return undefined;
  return {
    index,
    query: {
      ...query,
      ...(cursor === undefined ? {} : { cursor: cursor.value }),
      ...(token === undefined ? {} : { at: { token: token.value } }),
    },
  };
};

const tagged = (index: number, answer: unknown): unknown => {
  if (answer === null || typeof answer !== "object") return answer;
  const fields = answer as { readonly cursor?: string | null; readonly asOfToken?: string | null };
  return {
    ...answer,
    ...("cursor" in fields ? { cursor: tag(index, fields.cursor ?? null) } : {}),
    ...("asOfToken" in fields ? { asOfToken: tag(index, fields.asOfToken ?? null) } : {}),
  };
};

/**
 * Asks several indexers in order: each query goes to the first one that can answer it.
 *
 * **When to use**
 *
 * Use to combine indexers with different coverage (bigname for Sepolia and verified reads,
 * Goldsky for Basenames) or to keep reading when one is down.
 *
 * **Details**
 *
 * - The next indexer is asked when one is unavailable, rate limiting, behind, or does not serve
 *   the query or its namespace (`on` narrows this). Not found is an answer: it is not retried.
 * - Every answer reports the indexer that gave it (`indexer`).
 * - Cursors and `asOfToken`s are tagged with the indexer that issued them; follow-up pages and
 *   snapshot reads go back to that indexer only.
 * - When every indexer fails, the last failure that was not `INDEXER_UNSUPPORTED` is reported.
 *
 * **Example** (bigname first, Goldsky after)
 *
 * ```ts
 * import { Ensforge } from "@ensforge/sdk"
 * import { bigname, fallback, goldsky } from "@ensforge/sdk/indexer"
 *
 * const ens = Ensforge.create({ publicClient, indexer: fallback([bigname(), goldsky()]) })
 * ```
 *
 * **Example** (Only when the first is down)
 *
 * ```ts
 * import { bigname, fallback, goldsky } from "@ensforge/sdk/indexer"
 *
 * const indexer = fallback([bigname(), goldsky()], { on: ["unavailable", "rateLimited"] })
 * ```
 *
 * **Example** (A self-hosted indexer first)
 *
 * ```ts
 * import { bigname, fallback } from "@ensforge/sdk/indexer"
 *
 * const indexer = fallback([bigname({ url: "https://bigname.internal" }), bigname()])
 * ```
 *
 * @category indexer
 * @since 1.0.0
 */
export const fallback = (
  indexers: readonly Indexer[],
  options: { readonly on?: readonly FallbackReason[] | undefined } = {},
): Indexer => {
  const implementations = indexers.map((indexer) => {
    const implementation = implementationOf(indexer);
    if (implementation === undefined) {
      throw new TypeError(`fallback: ${indexer.id} was not built by ensforge.`);
    }
    return implementation;
  });
  const moveOn = new Set<FallbackReason>(
    options.on ?? ["unavailable", "rateLimited", "unsupported", "behind"],
  );
  const id = `fallback(${implementations.map((implementation) => implementation.id).join(", ")})`;

  const methods: Record<string, unknown> = {};
  for (const method of methodNames) {
    if (implementations.every((implementation) => implementation.methods[method] === undefined)) {
      continue;
    }

    const ask = (index: number, query: unknown, context: CallContext) => {
      const run = implementations[index]?.methods[method as Method] as
        | ((query: unknown, context: CallContext) => Effect.Effect<unknown, AnyError>)
        | undefined;
      return run === undefined
        ? undefined
        : run(query, context).pipe(Effect.map((answer) => tagged(index, answer)));
    };

    methods[method] = Effect.fnUntraced(function* (query: Query, context: CallContext) {
      const pin = pinned(query);
      if (pin !== undefined) {
        // A tagged cursor is unreadable by the other indexers, so never fall through with it.
        const answer = ask(pin.index, pin.query, context);
        if (answer === undefined) {
          return yield* Effect.fail(
            new IndexerError({
              code: "INDEXER_UNSUPPORTED",
              source: id,
              shortMessage: `The cursor or snapshot token was issued by indexer ${pin.index}, which cannot serve ${method}.`,
            }),
          );
        }
        return yield* answer;
      }

      let failure: AnyError | undefined;
      for (let index = 0; index < implementations.length; index += 1) {
        const answer = ask(index, query, context);
        if (answer === undefined) continue;

        const outcome = yield* answer.pipe(
          Effect.map((value) => ({ ok: true as const, value })),
          Effect.catch((error: AnyError) => {
            const reason = error._tag === "IndexerError" ? reasons[error.code] : undefined;
            return reason !== undefined && moveOn.has(reason)
              ? Effect.succeed({ ok: false as const, error })
              : Effect.fail(error);
          }),
        );
        if (outcome.ok) return outcome.value;
        // An indexer that could not serve the query explains less than one that failed.
        if (failure === undefined || outcome.error.code !== "INDEXER_UNSUPPORTED") {
          failure = outcome.error;
        }
      }
      return yield* Effect.fail(failure as AnyError);
    });
  }

  return makeIndexer({ id, methods: methods as Implementation["methods"] });
};
