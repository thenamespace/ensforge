import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import * as Actions from "@ensforge/sdk/internal/actions/effect";
import { IndexerError } from "@ensforge/sdk/internal/errors/classes/IndexerError";
import { NotFoundError } from "@ensforge/sdk/internal/errors/classes/NotFoundError";
import type { AnyError } from "@ensforge/sdk/internal/errors/types";
import { fallback, type FallbackReason } from "@ensforge/sdk/internal/indexer/fallback";
import type { Query } from "@ensforge/sdk/internal/indexer/Indexer";
import { define } from "@ensforge/sdk/internal/indexer/Indexer.effect";
import { Arbitraries, expectFailure } from "@ensforge/test-harness";

import { clientWith } from "./client.js";

const page = (cursor: string | null, asOfToken: string | null = null) => ({
  items: [],
  cursor,
  asOfToken,
  hasMore: cursor !== null,
  totalCount: null,
});

type Answer = (query: Query.GetSubnames) => Effect.Effect<ReturnType<typeof page>, AnyError>;

/** An adapter answering `getSubnames` and `getName`, recording the queries it receives. */
const adapter = (id: string, answer: Answer) => {
  const seen: Query.GetSubnames[] = [];
  const named: Query.GetName[] = [];
  const indexer = define({
    id,
    getSubnames: (query) => {
      seen.push(query);
      return answer(query);
    },
    getName: (query) => {
      named.push(query);
      return Effect.succeed(null);
    },
  });
  return { indexer, seen, named };
};

const failing = (code: IndexerError.Code) => () =>
  Effect.fail(new IndexerError({ code, source: "test" }));

const subnames = (indexers: readonly ReturnType<typeof adapter>[], options = {}, cursor?: string) =>
  Actions.indexer.getSubnames(
    clientWith(
      fallback(
        indexers.map((entry) => entry.indexer),
        options,
      ),
    ),
    { name: "nick.eth", ...(cursor === undefined ? {} : { cursor }) },
  );

describe("fallback routing", () => {
  it.effect("answers from the first indexer that can, tagging its cursor", () =>
    Effect.gen(function* () {
      const first = adapter("a", failing("INDEXER_UNAVAILABLE"));
      const second = adapter("b", () => Effect.succeed(page("next", "tok")));

      const answer = yield* subnames([first, second]);

      assert.strictEqual(answer.indexer, "b");
      assert.strictEqual(answer.cursor, "f1:next");
      assert.strictEqual(answer.asOfToken, "f1:tok");
      assert.deepStrictEqual([first.seen.length, second.seen.length], [1, 1]);
    }),
  );

  it.effect("leaves a last page's null cursor untagged", () =>
    Effect.gen(function* () {
      const answer = yield* subnames([adapter("a", () => Effect.succeed(page(null)))]);
      assert.deepStrictEqual([answer.cursor, answer.asOfToken], [null, null]);
    }),
  );

  it.effect.each([
    ["INDEXER_UNAVAILABLE", true],
    ["INDEXER_RATE_LIMITED", true],
    ["INDEXER_UNSUPPORTED", true],
    ["INDEXER_BEHIND", true],
    ["INDEXER_REQUEST_REJECTED", false],
    ["INDEXER_RESPONSE_INVALID", false],
  ] as const)("on %s moves on: %s", ([code, movesOn]) =>
    Effect.gen(function* () {
      const second = adapter("b", () => Effect.succeed(page(null)));

      const exit = yield* Effect.exit(subnames([adapter("a", failing(code)), second]));

      assert.strictEqual(exit._tag === "Success", movesOn);
      assert.strictEqual(second.seen.length, movesOn ? 1 : 0);
    }),
  );

  it.effect("treats not found as an answer", () =>
    Effect.gen(function* () {
      const second = adapter("b", () => Effect.succeed(page(null)));
      const missing = adapter("a", () =>
        Effect.fail(new NotFoundError({ code: "INDEXER_NOT_FOUND" })),
      );

      yield* expectFailure(subnames([missing, second]), {
        _tag: "NotFoundError",
        code: "INDEXER_NOT_FOUND",
      });
      assert.strictEqual(second.seen.length, 0);
    }),
  );

  it.effect("moves on only for the reasons in `on`", () =>
    Effect.gen(function* () {
      const on: FallbackReason[] = ["unavailable"];
      const second = adapter("b", () => Effect.succeed(page(null)));

      yield* subnames([adapter("a", failing("INDEXER_UNAVAILABLE")), second], { on });
      yield* expectFailure(
        subnames([adapter("a", failing("INDEXER_RATE_LIMITED")), second], { on }),
        { _tag: "IndexerError", code: "INDEXER_RATE_LIMITED" },
      );
      assert.strictEqual(second.seen.length, 1);
    }),
  );

  it.effect("skips indexers without the method", () =>
    Effect.gen(function* () {
      const statusOnly = define({
        id: "status-only",
        getStatus: () => Effect.succeed({ status: "ready", chains: {} }),
      });
      const second = adapter("b", () => Effect.succeed(page("x")));
      const client = clientWith(fallback([statusOnly, second.indexer]));

      const answer = yield* Actions.indexer.getSubnames(client, { name: "nick.eth" });

      assert.strictEqual(answer.cursor, "f1:x");
    }),
  );

  it.effect.each([
    [["INDEXER_UNSUPPORTED", "INDEXER_UNAVAILABLE", "INDEXER_UNSUPPORTED"], "INDEXER_UNAVAILABLE"],
    [["INDEXER_BEHIND", "INDEXER_RATE_LIMITED"], "INDEXER_RATE_LIMITED"],
    [["INDEXER_UNSUPPORTED", "INDEXER_UNSUPPORTED"], "INDEXER_UNSUPPORTED"],
  ] as const)("when all fail with %j, reports %s", ([codes, expected]) =>
    Effect.gen(function* () {
      const indexers = codes.map((code, index) => adapter(`i${index}`, failing(code)));
      yield* expectFailure(subnames(indexers), { _tag: "IndexerError", code: expected });
    }),
  );

  it("names itself after its indexers and rejects foreign values", () => {
    const indexer = fallback([adapter("a", failing("INDEXER_UNAVAILABLE")).indexer]);

    assert.strictEqual(indexer.id, "fallback(a)");
    assert.throws(
      () => fallback([{ id: "fake", "~ensforge/indexer": true }]),
      "fallback: fake was not built by ensforge.",
    );
  });

  it.effect("fails a method no indexer implements with INDEXER_UNSUPPORTED", () =>
    Effect.gen(function* () {
      const client = clientWith(fallback([adapter("a", failing("INDEXER_UNAVAILABLE")).indexer]));
      yield* expectFailure(Actions.indexer.getStatus(client, {}), {
        _tag: "IndexerError",
        code: "INDEXER_UNSUPPORTED",
      });
    }),
  );
});

describe("fallback pinning", () => {
  it.effect.prop(
    "a tagged cursor goes back, untagged, to the indexer that issued it",
    [Schema.String, Arbitraries.uint(2)],
    ([cursor, issuer]) =>
      Effect.gen(function* () {
        const indexers = [0, 1, 2].map((index) =>
          adapter(`i${index}`, (query) =>
            index < issuer
              ? failing("INDEXER_UNAVAILABLE")()
              : Effect.succeed(page(query.cursor === undefined ? cursor : null)),
          ),
        );
        const first = yield* subnames(indexers);
        for (const entry of indexers) entry.seen.length = 0;

        yield* subnames(indexers, {}, first.cursor ?? undefined);

        assert.strictEqual(first.cursor, `f${issuer}:${cursor}`);
        assert.deepStrictEqual(
          indexers.map((entry) => entry.seen.map((query) => query.cursor)),
          [0, 1, 2].map((index) => (index === issuer ? [cursor] : [])),
        );
      }),
  );

  it.effect("does not fall back from a pinned indexer", () =>
    Effect.gen(function* () {
      const first = adapter("a", failing("INDEXER_UNAVAILABLE"));
      const second = adapter("b", () => Effect.succeed(page(null)));

      yield* expectFailure(subnames([first, second], {}, "f0:c"), {
        _tag: "IndexerError",
        code: "INDEXER_UNAVAILABLE",
      });
      assert.strictEqual(second.seen.length, 0);
    }),
  );

  it.effect("fails a cursor whose issuer is not in this fallback", () =>
    Effect.gen(function* () {
      const only = adapter("a", () => Effect.succeed(page(null)));

      yield* expectFailure(subnames([only], {}, "f3:c"), {
        _tag: "IndexerError",
        code: "INDEXER_UNSUPPORTED",
      });
      assert.strictEqual(only.seen.length, 0);
    }),
  );

  it.effect("passes an untagged cursor through to every indexer in order", () =>
    Effect.gen(function* () {
      const first = adapter("a", failing("INDEXER_UNSUPPORTED"));
      const second = adapter("b", () => Effect.succeed(page(null)));

      yield* subnames([first, second], {}, "raw");

      assert.deepStrictEqual([first.seen[0]?.cursor, second.seen[0]?.cursor], ["raw", "raw"]);
    }),
  );

  it.effect("pins snapshot tokens to their indexer", () =>
    Effect.gen(function* () {
      const first = adapter("a", failing("INDEXER_UNAVAILABLE"));
      const second = adapter("b", () => Effect.succeed(page(null)));
      const client = clientWith(fallback([first.indexer, second.indexer]));

      const answer = yield* Actions.indexer.getName(client, {
        name: "nick.eth",
        at: { token: "f1:snap" },
      });

      assert.isNull(answer);
      assert.deepStrictEqual(first.named, []);
      assert.deepStrictEqual(second.named[0]?.at, { token: "snap" });
    }),
  );

  it.effect("nests: an outer tag wraps the inner one", () =>
    Effect.gen(function* () {
      const inner = adapter("b", (query) => Effect.succeed(page(query.cursor ?? "c")));
      const nested = fallback([
        fallback([adapter("a", failing("INDEXER_UNAVAILABLE")).indexer, inner.indexer]),
      ]);
      const client = clientWith(nested);

      const first = yield* Actions.indexer.getSubnames(client, { name: "nick.eth" });
      const second = yield* Actions.indexer.getSubnames(client, {
        name: "nick.eth",
        cursor: first.cursor ?? "",
      });

      assert.strictEqual(first.cursor, "f0:f1:c");
      assert.strictEqual(inner.seen[1]?.cursor, "c");
      assert.strictEqual(second.cursor, "f0:f1:c");
    }),
  );
});
