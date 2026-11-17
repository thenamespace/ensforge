import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { expectFailure } from "@ensforge/test-harness";
import { fakeBigname, reply, type FakeIndexer } from "@ensforge/test-harness/indexer/fake-bigname";

import type { IndexerError } from "#/errors/classes/IndexerError";
import { send, type HttpConfig, type HttpRequest } from "#/internal/indexer/http";

const configOf = (fake: FakeIndexer, overrides: Partial<HttpConfig> = {}): HttpConfig => ({
  id: "bigname",
  baseUrl: `${fake.url}/v1`,
  headers: {},
  fetch: fake.fetch,
  timeout: 15_000,
  retryCount: 2,
  cache: undefined,
  ...overrides,
});

const status: HttpRequest = { route: "/status", path: "/status" };

// Runs `effect` while moving the test clock in small steps, so retries waiting on a timer wake.
const withClock = <A, E>(effect: Effect.Effect<A, E>, millis: number, step = 50) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(Effect.exit(effect));
    for (let elapsed = 0; elapsed < millis; elapsed += step) yield* TestClock.adjust(step);
    return yield* Effect.flatten(Fiber.join(fiber));
  });

describe("send: retries", () => {
  it.effect.each([408, 429, 502, 503, 504])("retries %d up to retryCount times", (code) =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.error(code));

      yield* expectFailure(withClock(send(configOf(fake), status), 2_000), {
        _tag: "IndexerError",
      });
      assert.strictEqual(fake.requests.length, 3);
    }),
  );

  it.effect.each([400, 401, 403, 409, 500, 501])("does not retry %d", (code) =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.error(code));

      yield* expectFailure(send(configOf(fake), status), { _tag: "IndexerError" });
      assert.strictEqual(fake.requests.length, 1);
    }),
  );

  it.effect("succeeds once a retry answers", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.once("/status", reply.error(503, "overloaded"), reply.network());

      const body = yield* withClock(send(configOf(fake), status), 1_000);

      assert.deepStrictEqual(
        fake.requests.map((request) => request.status),
        [503, undefined, 200],
      );
      assert.strictEqual((body as { data: { status: string } }).data.status, "ready");
    }),
  );

  it.effect("backs off 250 ms, then doubles", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.error(503));
      const fiber = yield* Effect.forkChild(Effect.exit(send(configOf(fake), status)));

      yield* TestClock.adjust(249);
      assert.strictEqual(fake.requests.length, 1);
      yield* TestClock.adjust(1);
      assert.strictEqual(fake.requests.length, 2);
      yield* TestClock.adjust(499);
      assert.strictEqual(fake.requests.length, 2);
      yield* TestClock.adjust(1);
      assert.strictEqual(fake.requests.length, 3);
      yield* Fiber.join(fiber);
    }),
  );

  it.effect("waits for Retry-After in seconds, capped at 30 s", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.once("/status", reply.rateLimited("3"), reply.rateLimited("3600"));
      const fiber = yield* Effect.forkChild(send(configOf(fake), status));

      yield* TestClock.adjust(2_999);
      assert.strictEqual(fake.requests.length, 1);
      yield* TestClock.adjust(1);
      assert.strictEqual(fake.requests.length, 2);
      yield* TestClock.adjust(29_999);
      assert.strictEqual(fake.requests.length, 2);
      yield* TestClock.adjust(1);
      yield* Fiber.join(fiber);
      assert.strictEqual(fake.requests.length, 3);
    }),
  );

  it.effect("waits for Retry-After as an HTTP date", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      // The test clock starts at 0: the date is 10 seconds after it.
      fake.once("/status", reply.rateLimited(new Date(10_000).toUTCString()));
      const fiber = yield* Effect.forkChild(send(configOf(fake), status));

      yield* TestClock.adjust(8_000);
      assert.strictEqual(fake.requests.length, 1);
      yield* TestClock.adjust(2_000);
      yield* Fiber.join(fiber);
      assert.strictEqual(fake.requests.length, 2);
    }),
  );

  it.effect.each(["soon", "-5"])("falls back to backoff for an unusable Retry-After %j", (header) =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.once("/status", reply.rateLimited(header));
      const fiber = yield* Effect.forkChild(send(configOf(fake), status));

      yield* TestClock.adjust(250);
      yield* Fiber.join(fiber);
      assert.strictEqual(fake.requests.length, 2);
    }),
  );

  it.effect("times out a hanging request, aborts it and retries", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.once("/status", reply.hang());
      const fiber = yield* Effect.forkChild(send(configOf(fake, { timeout: 1_000 }), status));

      yield* TestClock.adjust(1_000);
      assert.isTrue(fake.requests[0]?.signal?.aborted);
      yield* TestClock.adjust(250);
      yield* Fiber.join(fiber);
      assert.strictEqual(fake.requests.length, 2);
    }),
  );

  it.effect("reports a timeout as INDEXER_UNAVAILABLE once retries run out", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.hang());

      const error = yield* expectFailure(
        withClock(send(configOf(fake, { timeout: 1_000, retryCount: 0 }), status), 1_000),
        { _tag: "IndexerError", code: "INDEXER_UNAVAILABLE" },
      );
      assert.strictEqual(error.shortMessage, "The indexer did not answer in time.");
    }),
  );

  it.effect("interrupting a call aborts its request", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.hang());
      const fiber = yield* Effect.forkChild(send(configOf(fake), status));

      yield* TestClock.adjust(10);
      yield* Fiber.interrupt(fiber);
      assert.isTrue(fake.requests[0]?.signal?.aborted);
    }),
  );
});

describe("send: error mapping", () => {
  it.effect.each([
    [400, "invalid_input", "INDEXER_REQUEST_REJECTED"],
    [409, "conflict", "INDEXER_REQUEST_REJECTED"],
    [503, "stale", "INDEXER_BEHIND"],
    [429, "rate_limited", "INDEXER_RATE_LIMITED"],
    [503, "overloaded", "INDEXER_RATE_LIMITED"],
    [504, "request_timeout", "INDEXER_UNAVAILABLE"],
    [500, "internal_error", "INDEXER_UNAVAILABLE"],
    [501, "unsupported", "INDEXER_UNSUPPORTED"],
    [418, "teapot", "INDEXER_REQUEST_REJECTED"],
    [502, "teapot", "INDEXER_UNAVAILABLE"],
    [401, undefined, "INDEXER_REQUEST_REJECTED"],
    [408, undefined, "INDEXER_UNAVAILABLE"],
    [429, undefined, "INDEXER_RATE_LIMITED"],
    [500, undefined, "INDEXER_UNAVAILABLE"],
  ] as const)("%d %s → %s", ([code, indexerCode, expected]) =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.error(code, indexerCode, "upstream says no"));

      const error = (yield* expectFailure(send(configOf(fake, { retryCount: 0 }), status), {
        _tag: "IndexerError",
        code: expected,
      })) as IndexerError;
      assert.strictEqual(error.status, code);
      assert.strictEqual(error.indexerCode, indexerCode);
      assert.strictEqual(error.route, "/status");
      assert.strictEqual(error.source, "bigname");
      if (indexerCode !== undefined) assert.deepStrictEqual(error.details, ["upstream says no"]);
    }),
  );

  it.effect.each([
    { label: "a bare 404", answer: reply.error(404) },
    { label: "a 404 with a body", answer: reply.error(404, "not_found", "No such name.") },
    { label: "not_found on another status", answer: reply.error(410, "not_found", "Gone.") },
  ])("maps $label to INDEXER_NOT_FOUND", ({ answer }) =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/names/{name}", answer);

      const error = yield* expectFailure(
        send(configOf(fake), { route: "/names/{name}", path: "/names/x.eth", resource: "x.eth" }),
        { _tag: "NotFoundError", code: "INDEXER_NOT_FOUND" },
      );
      assert.strictEqual((error as unknown as { resource: string }).resource, "x.eth");
      assert.strictEqual(fake.requests.length, 1);
    }),
  );

  it.effect("fails a 200 that is not JSON with INDEXER_RESPONSE_INVALID, without retrying", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.text("<html>maintenance</html>"));

      yield* expectFailure(send(configOf(fake), status), {
        _tag: "IndexerError",
        code: "INDEXER_RESPONSE_INVALID",
      });
      assert.strictEqual(fake.requests.length, 1);
    }),
  );

  it.effect("maps an error status with a non-JSON body by its status", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.text("Bad Gateway", 502));

      yield* expectFailure(send(configOf(fake, { retryCount: 0 }), status), {
        _tag: "IndexerError",
        code: "INDEXER_UNAVAILABLE",
      });
    }),
  );

  it.effect("maps a network failure to INDEXER_UNAVAILABLE", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      fake.on("/status", reply.network("getaddrinfo ENOTFOUND"));

      yield* expectFailure(send(configOf(fake, { retryCount: 0 }), status), {
        _tag: "IndexerError",
        code: "INDEXER_UNAVAILABLE",
      });
    }),
  );
});

describe("send: requests", () => {
  it.effect("encodes the query: arrays joined or repeated, empty values left out", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();

      yield* send(configOf(fake), {
        route: "/names",
        path: "/names",
        query: {
          expires_window: ["1..2", "3..4"],
          include: ["data", "total_count"],
          authority: [],
          page_size: 10,
          dedupe: undefined,
          is_migrated: false,
          from_block: 26_000_000n,
        },
        repeat: ["expires_window"],
      });

      const { query } = fake.requests[0] as { query: URLSearchParams };
      assert.deepStrictEqual(query.getAll("expires_window"), ["1..2", "3..4"]);
      assert.strictEqual(query.get("include"), "data,total_count");
      assert.isFalse(query.has("authority"));
      assert.isFalse(query.has("dedupe"));
      assert.strictEqual(query.get("page_size"), "10");
      assert.strictEqual(query.get("is_migrated"), "false");
      assert.strictEqual(query.get("from_block"), "26000000");
    }),
  );

  it.effect("sends a body as a JSON POST, and custom headers on every request", () =>
    Effect.gen(function* () {
      const fake = fakeBigname();
      const config = configOf(fake, { headers: { "x-api-key": "k" } });

      yield* send(config, { route: "/lookup", path: "/lookup", body: { inputs: [] } });

      const [request] = fake.requests;
      assert.strictEqual(request?.method, "POST");
      assert.deepStrictEqual(request?.body, { inputs: [] });
      assert.strictEqual(request?.headers["content-type"], "application/json");
      assert.strictEqual(request?.headers["x-api-key"], "k");
    }),
  );
});

describe("send: ETag cache", () => {
  it.effect("revalidates with If-None-Match and answers a 304 from the cache", () =>
    Effect.gen(function* () {
      const fake = fakeBigname({ etag: true });
      const config = configOf(fake, { cache: new Map() });

      const first = yield* send(config, status);
      const second = yield* send(config, status);

      assert.deepStrictEqual(second, first);
      assert.deepStrictEqual(
        fake.requests.map((request) => request.status),
        [200, 304],
      );
      assert.isDefined(fake.requests[1]?.headers["if-none-match"]);
    }),
  );

  it.effect("does not revalidate without the cache, nor cache POSTs", () =>
    Effect.gen(function* () {
      const fake = fakeBigname({ etag: true });
      const lookup: HttpRequest = { route: "/lookup", path: "/lookup", body: { inputs: [] } };
      const cached = configOf(fake, { cache: new Map() });

      yield* send(configOf(fake), status);
      yield* send(configOf(fake), status);
      yield* send(cached, lookup);
      yield* send(cached, lookup);

      assert.isTrue(
        fake.requests.every((request) => request.headers["if-none-match"] === undefined),
      );
      assert.strictEqual(cached.cache?.size, 0);
    }),
  );

  it.effect("evicts the oldest entry beyond 500", () =>
    Effect.gen(function* () {
      const fake = fakeBigname({ etag: true });
      const cache = new Map<string, { etag: string; body: unknown }>();
      const config = configOf(fake, { cache });

      for (let index = 0; index <= 500; index += 1) {
        yield* send(config, { route: "/status", path: "/status", query: { n: index } });
      }

      assert.strictEqual(cache.size, 500);
      assert.isFalse(cache.has(`${fake.url}/v1/status?n=0`));
      assert.isTrue(cache.has(`${fake.url}/v1/status?n=500`));
    }),
  );
});
