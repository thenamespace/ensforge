import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { labelhash, namehash } from "viem/ens";

import {
  getIndexedName,
  getNames,
  searchNames,
} from "../../../../src/actions/indexer/names/index.js";
import { createConfig } from "../../../../src/index.js";
import {
  makeMainnetPublicClient,
  makeSepoliaPublicClient,
} from "../../fixtures/client-fixtures.js";

const owner = "0x000000000000000000000000000000000000bEEF" as const;

const response = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const v1Name = (name: string, createdAt: number, migrated = true) => {
  const [label = ""] = name.split(".");

  return {
    id: namehash(name),
    name,
    labelName: label,
    labelhash: labelhash(label),
    parent: { id: namehash(name.slice(label.length + 1)) },
    owner: { id: owner.toLowerCase() },
    registrant: { id: owner.toLowerCase() },
    resolvedAddress: null,
    resolver: null,
    createdAt: String(createdAt),
    expiryDate: "1900000000",
    subdomainCount: 0,
    isMigrated: migrated,
    ttl: "0",
    registration: {
      registrant: { id: owner.toLowerCase() },
      registrationDate: String(createdAt),
      expiryDate: "1900000000",
    },
    wrappedOwner: null,
    wrappedDomain: null,
  };
};

const v2Name = (name: string, createdAt: number, protocol: "v1" | "v2" = "v2") => {
  const [label = ""] = name.split(".");

  return {
    id: name,
    protocol,
    name,
    labelName: label,
    labelhash: labelhash(label),
    parent: { id: name.slice(label.length + 1), subregistry: null },
    owner: { id: owner.toLowerCase() },
    registrant: { id: owner.toLowerCase() },
    resolvedAddress: null,
    resolver: null,
    createdAt,
    expiryDate: 1_900_000_000,
    subdomainCount: 0,
    isMigrated: protocol === "v2",
    ttl: protocol === "v1" ? 0 : null,
    wrappedOwner: null,
    wrappedDomain: null,
    subregistry: null,
    canonicalId: protocol === "v2" ? "0x01" : null,
    tokenId: protocol === "v2" ? "0x01" : null,
    tokenVersion: protocol === "v2" ? 1 : null,
    registrationDate: createdAt,
    gracePeriodEnd: null,
    unreachableSince: null,
    isNormalized: true,
    isReachable: true,
    isWrapped: false,
    roleHolderCount: 0,
  };
};

const operation = (init: RequestInit | undefined) => {
  const body = JSON.parse(String(init?.body)) as {
    readonly query: string;
    readonly variables: Record<string, unknown>;
  };

  return body;
};

describe("indexed name actions", () => {
  it.effect("reads a Mainnet name from the V1 indexer", () =>
    Effect.gen(function* () {
      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        assert.include(request.query, "V1GetIndexedName");
        assert.strictEqual(request.variables.id, namehash("alice.eth"));

        return Promise.resolve(
          response({
            data: { _meta: { block: { number: 100 } }, domain: v1Name("alice.eth", 10) },
          }),
        );
      };

      const config = createConfig({
        network: "mainnet",
        publicClient: makeMainnetPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const result = yield* getIndexedName.effect(config, { name: "ALICE.eth" });

      assert.strictEqual(result?.protocol, "v1");
      assert.strictEqual(result?.name.kind, "normalized");

      if (result?.name.kind !== "normalized") return assert.fail("expected a normalized name");

      assert.strictEqual(result.name.value, "alice.eth");
      assert.strictEqual(result?.source.indexedBlock, 100n);
    }),
  );

  it.effect("prefers the combined V2 source on Sepolia", () =>
    Effect.gen(function* () {
      let v1Requests = 0;

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        if (request.query.includes("V1GetIndexedName")) v1Requests += 1;

        return Promise.resolve(
          response({
            data: {
              _meta: { block: { number: 200 } },
              byName: v2Name("alice.eth", 10),
              byNamehash: null,
            },
          }),
        );
      };

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const result = yield* getIndexedName.effect(config, { name: "alice.eth" });

      assert.strictEqual(v1Requests, 0);
      assert.strictEqual(result?.protocol, "v2");
      assert.strictEqual(result?.source.protocol, "v2");
    }),
  );

  it.effect("falls back to V1 when the combined source has no entity", () =>
    Effect.gen(function* () {
      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        return Promise.resolve(
          request.query.includes("V2GetIndexedName")
            ? response({
                data: {
                  _meta: { block: { number: 200 } },
                  byName: null,
                  byNamehash: null,
                },
              })
            : response({
                data: {
                  _meta: { block: { number: 100 } },
                  domain: v1Name("legacy.eth", 10),
                },
              }),
        );
      };

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const result = yield* getIndexedName.effect(config, { name: "legacy.eth" });

      assert.strictEqual(result?.protocol, "v1");
      assert.strictEqual(result?.source.protocol, "v1");
    }),
  );

  it.effect("merges, deduplicates, and resumes independent source pages", () =>
    Effect.gen(function* () {
      let v1Page = 0;
      let v2Page = 0;

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        if (request.query.includes("V1GetNames")) {
          v1Page += 1;

          const domains =
            v1Page === 1
              ? [v1Name("alice.eth", 40), v1Name("charlie.eth", 20)]
              : [v1Name("charlie.eth", 20)];

          return Promise.resolve(
            response({ data: { _meta: { block: { number: 100 } }, domains } }),
          );
        }

        v2Page += 1;

        const edges =
          v2Page === 1
            ? [
                { cursor: "v2-alice", node: v2Name("alice.eth", 40, "v1") },
                { cursor: "v2-bob", node: v2Name("bob.eth", 30) },
                { cursor: "v2-delta", node: v2Name("delta.eth", 10) },
              ]
            : [{ cursor: "v2-delta", node: v2Name("delta.eth", 10) }];

        return Promise.resolve(
          response({
            data: {
              _meta: { block: { number: 200 } },
              domainConnection: {
                edges,
                pageInfo: { hasNextPage: false, endCursor: edges.at(-1)?.cursor ?? null },
              },
            },
          }),
        );
      };

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const first = yield* getNames.effect(config, { pageSize: 2 });

      assert.deepStrictEqual(
        first.items.map((name) => [
          name.name.kind === "unknown" ? null : name.name.value,
          name.source.protocol,
        ]),
        [
          ["alice.eth", "v2"],
          ["bob.eth", "v2"],
        ],
      );
      assert.isNotNull(first.pageInfo.cursor);

      if (first.pageInfo.cursor === null) return assert.fail("expected another page");

      const second = yield* getNames.effect(config, {
        pageSize: 2,
        cursor: first.pageInfo.cursor,
      });

      assert.deepStrictEqual(
        second.items.map((name) => (name.name.kind === "unknown" ? null : name.name.value)),
        ["charlie.eth", "delta.eth"],
      );
      assert.deepStrictEqual(second.pageInfo, { cursor: null, hasNextPage: false });
    }),
  );

  it.effect("uses the dedicated V1 source for a V1-only name list", () =>
    Effect.gen(function* () {
      let requests = 0;

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        requests += 1;
        assert.include(request.query, "V1GetNames");
        assert.notProperty(request.variables.where, "isMigrated");

        return Promise.resolve(
          response({
            data: {
              _meta: { block: { number: 100 } },
              domains: [v1Name("legacy.eth", 10)],
            },
          }),
        );
      };

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const result = yield* getNames.effect(config, {
        filter: { protocol: "v1", migrated: false },
        pageSize: 1,
      });

      assert.strictEqual(requests, 1);
      assert.strictEqual(result.items[0]?.protocol, "v1");
    }),
  );

  it.effect("refills V2 pages when a portable protocol filter is applied locally", () =>
    Effect.gen(function* () {
      let requests = 0;

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        requests += 1;

        const after = request.variables.after;

        const edges =
          after === null
            ? [
                { cursor: "legacy-1", node: v2Name("legacy-one.eth", 30, "v1") },
                { cursor: "legacy-2", node: v2Name("legacy-two.eth", 20, "v1") },
              ]
            : [{ cursor: "native", node: v2Name("native.eth", 10) }];

        return Promise.resolve(
          response({
            data: {
              _meta: { block: { number: 200 } },
              domainConnection: {
                edges,
                pageInfo: {
                  hasNextPage: after === null,
                  endCursor: edges.at(-1)?.cursor ?? null,
                },
              },
            },
          }),
        );
      };

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { endpoints: { v1: null }, fetch, retry: { attempts: 0 } },
      });

      const result = yield* getNames.effect(config, {
        filter: { protocol: "v2" },
        pageSize: 1,
      });

      assert.strictEqual(requests, 2);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0]?.protocol, "v2");
      assert.isFalse(result.pageInfo.hasNextPage);
    }),
  );

  it.effect("searches live V1 names when the V2 source is enabled", () =>
    Effect.gen(function* () {
      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);
        assert.include(request.query, "V1GetNames");
        assert.notProperty(request.variables.where, "isMigrated");

        return Promise.resolve(
          response({
            data: {
              _meta: { block: { number: 100 } },
              domains: [v1Name("alice.eth", 10)],
            },
          }),
        );
      };

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const result = yield* searchNames.effect(config, {
        query: "ali",
        filter: { protocol: "v1" },
      });

      assert.strictEqual(result.items.length, 1);
      assert.isFalse(result.items[0]?.isMigrated);
    }),
  );

  it.effect("refills V2 expiry-filtered pages and retains names without expiry", () =>
    Effect.gen(function* () {
      let requests = 0;

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        requests += 1;
        assert.notProperty(request.variables.where, "expiryDate_gt");

        const nodes =
          request.variables.after === null
            ? [
                { ...v2Name("expired.eth", 30), expiryDate: 99 },
                { ...v2Name("boundary.eth", 20), expiryDate: 100 },
              ]
            : [{ ...v2Name("permanent.eth", 10), expiryDate: null }];
        const edges = nodes.map((node) => ({ node, cursor: node.id }));
        return Promise.resolve(
          response({
            data: {
              _meta: { block: { number: 200 } },
              domainConnection: {
                edges,
                pageInfo: { hasNextPage: requests === 1, endCursor: edges.at(-1)?.cursor },
              },
            },
          }),
        );
      };

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { endpoints: { v1: null }, fetch, retry: { attempts: 0 } },
      });

      const result = yield* getNames.effect(config, { filter: { expiryAfter: 100n }, pageSize: 1 });

      assert.strictEqual(requests, 2);
      assert.strictEqual(result.items[0]?.name.value, "permanent.eth");
      assert.isNull(result.items[0]?.expiry);
      assert.isFalse(result.pageInfo.hasNextPage);
    }),
  );

  it.effect("reports a failed source in partial mode and fails in strict mode", () =>
    Effect.gen(function* () {
      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        return Promise.resolve(
          request.query.includes("V1GetNames")
            ? response({ errors: [{ message: "V1 unavailable" }] }, 503)
            : response({
                data: {
                  _meta: { block: { number: 200 } },
                  domainConnection: {
                    edges: [{ cursor: "native", node: v2Name("native.eth", 10) }],
                    pageInfo: { hasNextPage: false, endCursor: "native" },
                  },
                },
              }),
        );
      };

      const partial = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { fetch, failureMode: "partial", retry: { attempts: 0 } },
      });

      const strict = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { fetch, failureMode: "strict", retry: { attempts: 0 } },
      });

      const page = yield* getNames.effect(partial, {});
      const failure = yield* getNames.effect(strict, {}).pipe(Effect.flip);

      assert.strictEqual(page.items.length, 1);
      assert.strictEqual(page.sources[0]?.status, "failed");
      assert.strictEqual(failure.code, "HTTP_FAILED");
    }),
  );
});
