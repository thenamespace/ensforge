import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";

import { expectFailure } from "@ensforge/test-harness";
import {
  fakeBigname,
  fakeGoldsky,
  reply,
  type FakeIndexer,
} from "@ensforge/test-harness/indexer/fake-bigname";
import { chainStatus, status } from "@ensforge/test-harness/indexer/fixtures/bigname";

import { capabilities } from "#/internal/indexer/capabilities";

const probe = (fake: FakeIndexer, version = "/v1") =>
  capabilities({
    id: "fake",
    baseUrl: `${fake.url}${version}`,
    headers: {},
    fetch: fake.fetch,
    timeout: 1_000,
    retryCount: 0,
    cache: undefined,
  });

const unsupported = { _tag: "IndexerError", code: "INDEXER_UNSUPPORTED" };

describe("capabilities.serve", () => {
  it.effect("serves ENS on the client's chain when the indexer declares it", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      assert.strictEqual(yield* probe(fake).serve("ens", 1), 1);
    }),
  );

  it.effect("rejects ENS for a client on a chain the indexer does not declare", () =>
    Effect.gen(function* () {
      const error = yield* expectFailure(probe(fakeBigname()).serve("ens", 11155111), unsupported);
      assert.include(error.shortMessage, "serves ENS on chain 1");
    }),
  );

  it.effect("rejects a namespace the indexer does not know", () =>
    expectFailure(probe(fakeBigname()).serve("basenames", 1), unsupported),
  );

  it.effect("reads a namespace on its home chain (Basenames on Base)", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* probe(fakeGoldsky(), "/v2").serve("basenames", 1), 8453);
    }),
  );

  it.effect("rejects a namespace whose home chain is not indexed yet", () =>
    Effect.gen(function* () {
      const fake = fakeGoldsky();
      fake.on(
        "/status",
        reply.envelope({
          data: {
            ...status,
            chains: { "1": chainStatus, "8453": { ...chainStatus, indexed_block: null } },
          },
        }),
      );

      const error = yield* expectFailure(probe(fake, "/v2").serve("basenames", 1), unsupported);
      assert.include(error.shortMessage, "does not index basenames yet");
    }),
  );

  it.effect(
    "assumes a server without /status and /namespaces serves ENS on the client's chain",
    () =>
      Effect.gen(function* () {
        const fake = fakeBigname({ without: ["/status", "/namespaces/{namespace}"] });

        assert.strictEqual(yield* probe(fake).serve("ens", 11155111), 11155111);
        yield* expectFailure(probe(fake).serve("basenames", 11155111), unsupported);
      }),
  );

  it.effect("assumes Base for Basenames when the indexer lists no networks", () =>
    Effect.gen(function* () {
      const fake = fakeGoldsky({ without: ["/status"] });
      fake.on(
        "/namespaces/{namespace}",
        reply.envelope({ data: { namespace: "basenames", capabilities: {}, networks: [] } }),
      );

      assert.strictEqual(yield* probe(fake, "/v2").serve("basenames", 1), 8453);
    }),
  );

  it.effect("fails the query when a probe fails, so fallback moves on", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.error(503, "overloaded"));

      yield* expectFailure(probe(fake).serve("ens", 1), {
        _tag: "IndexerError",
        code: "INDEXER_RATE_LIMITED",
      });
    }),
  );

  it.effect("fails on a malformed probe answer", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/namespaces/{namespace}", reply.envelope({ data: { networks: "mainnet" } }));

      yield* expectFailure(probe(fake).serve("ens", 1), {
        _tag: "IndexerError",
        code: "INDEXER_RESPONSE_INVALID",
      });
    }),
  );

  it.effect("caches probes: /status for 5 minutes, /namespaces for an hour", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      const serve = probe(fake).serve;
      const count = () => [
        fake.requestsTo("/status").length,
        fake.requestsTo("/namespaces/{namespace}").length,
      ];

      yield* serve("ens", 1);
      yield* serve("ens", 1);
      assert.deepStrictEqual(count(), [1, 1]);

      yield* TestClock.adjust("5 minutes");
      yield* serve("ens", 1);
      assert.deepStrictEqual(count(), [2, 1]);

      yield* TestClock.adjust("55 minutes");
      yield* serve("ens", 1);
      assert.deepStrictEqual(count(), [3, 2]);
    }),
  );
});
