import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";

import * as Actions from "@ensforge/sdk/internal/actions/effect";
import { IndexerError } from "@ensforge/sdk/internal/errors/classes/IndexerError";
import type { AnyError } from "@ensforge/sdk/internal/errors/types";
import { defineIndexer } from "@ensforge/sdk/internal/indexer/define";
import type { Context } from "@ensforge/sdk/internal/indexer/Indexer";
import { define } from "@ensforge/sdk/internal/indexer/Indexer.effect";
import { expectFailure, expectRejection } from "@ensforge/test-harness";

import { clientWith } from "./client.js";

const invalid = { _tag: "IndexerError", code: "INDEXER_RESPONSE_INVALID" };
const items = { items: [], cursor: null, hasMore: false, totalCount: null };

describe("defineIndexer", () => {
  it.effect("fills missing metadata and always reports its own id", () =>
    Effect.gen(function* () {
      const client = clientWith(
        defineIndexer({
          id: "in-house",
          getSubnames: async () => ({ ...items, completeness: "partial", indexer: "spoofed" }),
        }),
      );

      const page = yield* Actions.indexer.getSubnames(client, { name: "nick.eth" });

      assert.deepStrictEqual(page, {
        ...items,
        asOf: null,
        snapshots: {},
        asOfToken: null,
        completeness: "partial",
        unsupportedReason: null,
        unsupportedFields: [],
        origin: null,
        indexer: "in-house",
      });
    }),
  );

  it.effect("adds no metadata to the status", () =>
    Effect.gen(function* () {
      const client = clientWith(
        defineIndexer({ id: "x", getStatus: async () => ({ status: "ready", chains: {} }) }),
      );
      const status = yield* Actions.indexer.getStatus(client, {});
      assert.deepStrictEqual(status, { status: "ready", chains: {}, indexer: "x" });
    }),
  );

  it.effect("passes validated queries and the client's chain", () =>
    Effect.gen(function* () {
      const calls: [unknown, Context][] = [];
      const client = clientWith(
        defineIndexer({
          id: "x",
          getName: async (query, context) => {
            calls.push([query, context]);
            return null;
          },
        }),
      );

      yield* Actions.indexer.getName(client, { name: "Jesse.Base.ETH" });

      const [query, context] = calls[0] as [unknown, Context];
      assert.deepStrictEqual(query, { name: "jesse.base.eth", namespace: "basenames" });
      assert.strictEqual(context.chainId, 1);
      assert.instanceOf(context.signal, AbortSignal);
    }),
  );

  it.effect("aborts the adapter's signal when the call is interrupted", () =>
    Effect.gen(function* () {
      let signal: AbortSignal | undefined;
      const client = clientWith(
        defineIndexer({
          id: "x",
          getName: (_, context) => {
            signal = context.signal;
            return new Promise(() => {});
          },
        }),
      );

      const fiber = yield* Effect.forkChild(Actions.indexer.getName(client, { name: "a.eth" }));
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);

      assert.isTrue(signal?.aborted);
    }),
  );

  it.effect.each([
    ["getName", null, null],
    ["getSubnames", null, invalid],
    ["getSubnames", "page", invalid],
    ["getSubnames", { items: "none" }, invalid],
  ] as const)("%s answering %j", ([method, draft, expected]) =>
    Effect.gen(function* () {
      const client = clientWith(defineIndexer({ id: "x", [method]: async () => draft } as never));
      const call: Effect.Effect<unknown, AnyError> =
        method === "getName"
          ? Actions.indexer.getName(client, { name: "a.eth" })
          : Actions.indexer.getSubnames(client, { name: "a.eth" });

      if (expected === null) assert.isNull(yield* call);
      else yield* expectFailure(call, expected);
    }),
  );

  it.effect("reports a thrown error as INDEXER_UNAVAILABLE with the cause", () =>
    Effect.gen(function* () {
      const cause = new Error("socket hang up");
      const client = clientWith(
        defineIndexer({
          id: "x",
          getName: async () => {
            throw cause;
          },
        }),
      );

      const error = yield* expectFailure(Actions.indexer.getName(client, { name: "a.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_UNAVAILABLE",
      });
      assert.strictEqual(error.cause, cause);
    }),
  );

  it("keeps a thrown ensforge error, through the Promise API too", async () => {
    const client = clientWith(
      defineIndexer({
        id: "x",
        getName: async () => {
          throw new IndexerError({ code: "INDEXER_BEHIND", source: "x" });
        },
      }),
    );

    await Effect.runPromise(
      expectRejection(() => client.indexer.getName({ name: "a.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_BEHIND",
      }),
    );
  });

  it.effect("fails methods it does not implement with INDEXER_UNSUPPORTED", () =>
    Effect.gen(function* () {
      const client = clientWith(defineIndexer({ id: "x" }));
      const error = yield* expectFailure(Actions.indexer.getName(client, { name: "a.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_UNSUPPORTED",
      });
      assert.strictEqual(error.shortMessage, "x does not support getName.");
    }),
  );
});

describe("Indexer.define", () => {
  it.effect("completes Effect answers and keeps their failures", () =>
    Effect.gen(function* () {
      const client = clientWith(
        define({
          id: "fx",
          getSubnames: () => Effect.succeed(items),
          getName: () => Effect.fail(new IndexerError({ code: "INDEXER_RATE_LIMITED" })),
        }),
      );

      const page = yield* Actions.indexer.getSubnames(client, { name: "a.eth" });

      assert.deepStrictEqual([page.indexer, page.completeness], ["fx", "full"]);
      yield* expectFailure(Actions.indexer.getName(client, { name: "a.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_RATE_LIMITED",
      });
    }),
  );
});

describe("client without an ensforge indexer", () => {
  it.effect.each([
    { label: "no indexer", indexer: undefined },
    { label: "a foreign value", indexer: { id: "fake", "~ensforge/indexer": true } as const },
  ])("fails with INDEXER_NOT_CONFIGURED for $label", ({ indexer }) =>
    expectFailure(Actions.indexer.getStatus(clientWith(indexer), {}), {
      _tag: "ConfigError",
      code: "INDEXER_NOT_CONFIGURED",
    }),
  );
});
