import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";

import { Name } from "@ensforge/sdk";
import * as Actions from "@ensforge/sdk/internal/actions/effect";
import { IndexerError } from "@ensforge/sdk/internal/errors/classes/IndexerError";
import type { AnyError } from "@ensforge/sdk/internal/errors/types";
import { defineIndexer } from "@ensforge/sdk/internal/indexer/define";
import type { Context } from "@ensforge/sdk/internal/indexer/Indexer";
import { define } from "@ensforge/sdk/internal/indexer/Indexer.effect";
import { expectFailure } from "@ensforge/test-harness";
import { labelhash } from "viem";

import { clientWith } from "./client.js";

describe("defineIndexer", () => {
  it.effect("fills missing metadata and always reports its own id", () =>
    Effect.gen(function* () {
      const empty = { items: [], cursor: null, hasMore: false, totalCount: null };
      const ens = clientWith(
        defineIndexer({
          id: "in-house",
          getSubnames: () =>
            Promise.resolve({ ...empty, completeness: "partial", indexer: "spoofed" }),
        }),
      );

      const page = yield* Actions.indexer.getSubnames(ens, { name: "nick.eth" });

      assert.deepStrictEqual(page, {
        ...empty,
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
      const ens = clientWith(
        defineIndexer({
          id: "x",
          getStatus: () => Promise.resolve({ status: "ready", chains: {} }),
        }),
      );

      const status = yield* Actions.indexer.getStatus(ens, {});

      assert.deepStrictEqual(status, { status: "ready", chains: {}, indexer: "x" });
    }),
  );

  it.effect("passes validated queries and the client's chain", () =>
    Effect.gen(function* () {
      const calls: [unknown, Context][] = [];
      const ens = clientWith(
        defineIndexer({
          id: "x",
          getName: (query, context) => {
            calls.push([query, context]);
            return Promise.resolve(null);
          },
        }),
      );

      yield* Actions.indexer.getName(ens, { name: "Jesse.Base.ETH" });

      const [query, context] = calls[0] as [unknown, Context];
      assert.deepStrictEqual(query, { name: "jesse.base.eth", namespace: "basenames" });
      assert.strictEqual(context.chainId, 1);
      assert.instanceOf(context.signal, AbortSignal);
    }),
  );

  it.effect(
    "infers Basenames for subnames of base.eth, also when its labels are encoded",
    () =>
      Effect.gen(function* () {
        const queries: unknown[] = [];
        const ens = clientWith(
          defineIndexer({
            id: "x",
            getName: (query) => {
              queries.push(query);
              return Promise.resolve(null);
            },
          }),
        );
        const base = Name.fromLabelhash(labelhash("base"));
        const eth = Name.fromLabelhash(labelhash("eth"));

        for (const name of [
          "base.eth",
          "jesse.base.eth",
          `jesse.${base}.eth`,
          `jesse.base.${eth}`,
        ]) {
          yield* Actions.indexer.getName(ens, { name });
        }

        assert.deepStrictEqual(
          queries.map((query) => (query as { namespace: string }).namespace),
          ["ens", "basenames", "basenames", "basenames"],
        );
      }),
    { meta: { cases: ["H12", "H20"] } },
  );

  it.effect("aborts the adapter's signal when the call is interrupted", () =>
    Effect.gen(function* () {
      let signal: AbortSignal | undefined;
      const ens = clientWith(
        defineIndexer({
          id: "x",
          getName: (_, context) => {
            signal = context.signal;
            return new Promise(() => {});
          },
        }),
      );

      const fiber = yield* Effect.forkChild(Actions.indexer.getName(ens, { name: "a.eth" }));
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);

      assert.isTrue(signal?.aborted);
    }),
  );

  it.effect.each([
    ["getName", null, null],
    ["getSubnames", null, "INDEXER_RESPONSE_INVALID"],
    ["getSubnames", "page", "INDEXER_RESPONSE_INVALID"],
    ["getSubnames", { items: "none" }, "INDEXER_RESPONSE_INVALID"],
  ] as const)("%s answering %j", ([method, draft, code]) =>
    Effect.gen(function* () {
      const ens = clientWith(
        defineIndexer({ id: "x", [method]: () => Promise.resolve(draft) } as never),
      );
      const call: Effect.Effect<unknown, AnyError> =
        method === "getName"
          ? Actions.indexer.getName(ens, { name: "a.eth" })
          : Actions.indexer.getSubnames(ens, { name: "a.eth" });

      if (code === null) assert.isNull(yield* call);
      else yield* expectFailure(call, { _tag: "IndexerError", code });
    }),
  );

  it.effect("reports a thrown error as INDEXER_UNAVAILABLE with the cause", () =>
    Effect.gen(function* () {
      const cause = new Error("socket hang up");
      const ens = clientWith(
        defineIndexer({
          id: "x",
          getName: () => Promise.reject(cause),
        }),
      );

      const error = yield* expectFailure(Actions.indexer.getName(ens, { name: "a.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_UNAVAILABLE",
      });
      assert.strictEqual(error.cause, cause);
    }),
  );

  it.effect("keeps a thrown ensforge error", () =>
    Effect.gen(function* () {
      const ens = clientWith(
        defineIndexer({
          id: "x",
          getName: () => Promise.reject(new IndexerError({ code: "INDEXER_BEHIND", source: "x" })),
        }),
      );

      yield* expectFailure(Actions.indexer.getName(ens, { name: "a.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_BEHIND",
      });
    }),
  );

  it.effect("fails methods it does not implement with INDEXER_UNSUPPORTED", () =>
    Effect.gen(function* () {
      const ens = clientWith(defineIndexer({ id: "x" }));
      const error = yield* expectFailure(Actions.indexer.getName(ens, { name: "a.eth" }), {
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
      const ens = clientWith(
        define({
          id: "fx",
          getSubnames: () =>
            Effect.succeed({ items: [], cursor: null, hasMore: false, totalCount: null }),
          getName: () => Effect.fail(new IndexerError({ code: "INDEXER_RATE_LIMITED" })),
        }),
      );

      const page = yield* Actions.indexer.getSubnames(ens, { name: "a.eth" });

      assert.deepStrictEqual([page.indexer, page.completeness], ["fx", "full"]);
      yield* expectFailure(Actions.indexer.getName(ens, { name: "a.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_RATE_LIMITED",
      });
    }),
  );
});

describe("client without an ensforge indexer", () => {
  it.effect.each([
    { label: "no indexer", indexer: undefined },
    {
      label: "a foreign value",
      indexer: { id: "fake", key: "fake", "~ensforge/indexer": true } as const,
    },
  ])("fails with INDEXER_NOT_CONFIGURED for $label", ({ indexer }) =>
    expectFailure(Actions.indexer.getStatus(clientWith(indexer), {}), {
      _tag: "ConfigError",
      code: "INDEXER_NOT_CONFIGURED",
    }),
  );
});
