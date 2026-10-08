import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { labelhash, namehash } from "viem/ens";

import {
  getDecodedName,
  getNamesForAddress,
  getResolvedNamesForAddress,
  getSubnames,
  searchNames,
} from "../../../../src/actions/indexer/names/index.js";
import { createConfig } from "../../../../src/index.js";
import {
  makeMainnetPublicClient,
  makeSepoliaPublicClient,
} from "../../fixtures/client-fixtures.js";

const owner = "0x000000000000000000000000000000000000bEEF" as const;

const response = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });

const operation = (init: RequestInit | undefined) =>
  JSON.parse(String(init?.body)) as {
    readonly query: string;
    readonly variables: Record<string, unknown>;
  };

const v1Name = (name: string, createdAt: number) => {
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
    isMigrated: false,
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

const v2Name = (name: string, createdAt: number) => {
  const [label = ""] = name.split(".");

  return {
    id: name,
    protocol: "v2",
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
    isMigrated: false,
    ttl: null,
    wrappedOwner: null,
    wrappedDomain: null,
    subregistry: null,
    canonicalId: "0x01",
    tokenId: "0x01",
    tokenVersion: 1,
    registrationDate: createdAt,
    gracePeriodEnd: null,
    unreachableSince: null,
    isNormalized: true,
    isReachable: true,
    isWrapped: false,
    roleHolderCount: 0,
  };
};

const emptyConnection = {
  edges: [],
  pageInfo: { hasNextPage: false, endCursor: null },
} as const;

describe("indexed discovery actions", () => {
  it.effect("returns every matching V1 relation and paginates the local result", () =>
    Effect.gen(function* () {
      const fetch: typeof globalThis.fetch = () =>
        Promise.resolve(
          response({
            data: {
              _meta: { block: { number: 100 } },
              domains: [v1Name("alice.eth", 20), v1Name("bob.eth", 10)],
            },
          }),
        );

      const config = createConfig({
        network: "mainnet",
        publicClient: makeMainnetPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const first = yield* getNamesForAddress.effect(config, { address: owner, pageSize: 1 });

      assert.deepStrictEqual(first.items[0]?.relations, ["owner"]);

      if (first.pageInfo.cursor === null) return assert.fail("expected another relation page");

      const second = yield* getNamesForAddress.effect(config, {
        address: owner,
        pageSize: 1,
        cursor: first.pageInfo.cursor,
      });

      assert.strictEqual(second.items.length, 1);
      assert.isFalse(second.pageInfo.hasNextPage);
    }),
  );

  it.effect("retains current-registry V1 names with both sources enabled", () =>
    Effect.gen(function* () {
      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);
        const data = request.query.includes("V1GetNamesForAddress")
          ? { domains: [{ ...v1Name("alice.eth", 10), isMigrated: true, expiryDate: null }] }
          : { owned: emptyConnection };
        return Promise.resolve(response({ data: { _meta: { block: { number: 100 } }, ...data } }));
      };

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const page = yield* getNamesForAddress.effect(config, {
        address: owner,
        relations: ["owner"],
        filter: { protocol: "v1", migrated: false, expiryAfter: 100n },
      });

      assert.strictEqual(page.items.length, 1);
      assert.strictEqual(page.items[0]?.name.value, "alice.eth");
      assert.isFalse(page.items[0]?.isMigrated);
      assert.isFalse(page.pageInfo.hasNextPage);
    }),
  );

  it.effect("refills V2 subname pages after filtering expired names", () =>
    Effect.gen(function* () {
      const children = [
        { ...v2Name("expired.parent.eth", 30), expiryDate: 99 },
        { ...v2Name("boundary.parent.eth", 20), expiryDate: 100 },
        { ...v2Name("permanent.parent.eth", 10), expiryDate: null },
      ];
      let requests = 0;

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        requests += 1;
        assert.notProperty(request.variables.where, "expiryDate_gt");

        const skip = Number(request.variables.skip);
        const first = Number(request.variables.first);
        return Promise.resolve(
          response({
            data: {
              _meta: { block: { number: 100 } },
              domain: { subregistry: { labels: children.slice(skip, skip + first) } },
            },
          }),
        );
      };

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: { endpoints: { v1: null }, fetch, retry: { attempts: 0 } },
      });

      const page = yield* getSubnames.effect(config, {
        name: "parent.eth",
        filter: { expiryAfter: 100n },
        pageSize: 1,
      });

      assert.strictEqual(requests, 2);
      assert.strictEqual(page.items[0]?.name.value, "permanent.parent.eth");
      assert.isFalse(page.pageInfo.hasNextPage);
    }),
  );

  it.effect("combines V2 ownership, resolution, registration, and role-holder relations", () =>
    Effect.gen(function* () {
      const alice = v2Name("alice.eth", 30);
      const bob = v2Name("bob.eth", 20);
      const carol = v2Name("carol.eth", 10);
      const operations: Array<string> = [];

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        operations.push(request.query);

        return Promise.resolve(
          request.query.includes("V2GetRelatedNames")
            ? response({ data: { _meta: { block: { number: 200 } }, domains: [carol] } })
            : response({
                data: {
                  _meta: { block: { number: 200 } },
                  owned: { edges: [{ node: alice }], pageInfo: emptyConnection.pageInfo },
                  resolved: { edges: [{ node: alice }], pageInfo: emptyConnection.pageInfo },
                  registrations: {
                    edges: [{ node: { domain: bob } }],
                    pageInfo: emptyConnection.pageInfo,
                  },
                  roles: {
                    edges: [{ node: { name: "carol.eth" } }],
                    pageInfo: emptyConnection.pageInfo,
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

      const page = yield* getNamesForAddress.effect(config, {
        address: owner,
        relations: ["owner", "manager", "resolved-address", "registrant", "role-holder"],
      });

      assert.deepStrictEqual(
        page.items.map(({ relations }) => relations),
        [["owner", "manager", "resolved-address"], ["registrant"], ["role-holder"]],
      );
      assert.isTrue(operations.some((query) => query.includes("V2GetOwnedNames")));
      assert.isTrue(operations.some((query) => query.includes("V2GetResolvedNames")));
      assert.isTrue(operations.some((query) => query.includes("V2GetRegistrationsForAddress")));
      assert.isTrue(operations.some((query) => query.includes("V2GetRolesForAddress")));
      assert.isTrue(
        operations
          .filter((query) => !query.includes("V2GetRelatedNames"))
          .every((query) => (query.match(/Connection\(/gu) ?? []).length === 1),
      );
    }),
  );

  it.effect("marks resolved-address discovery as indexed and unverified", () =>
    Effect.gen(function* () {
      const resolved = { ...v1Name("alice.eth", 10), resolvedAddress: { id: owner.toLowerCase() } };

      const config = createConfig({
        network: "mainnet",
        publicClient: makeMainnetPublicClient(),
        indexer: {
          fetch: () =>
            Promise.resolve(
              response({ data: { _meta: { block: { number: 100 } }, domains: [resolved] } }),
            ),
          retry: { attempts: 0 },
        },
      });

      const page = yield* getResolvedNamesForAddress.effect(config, { address: owner });

      assert.strictEqual(page.items[0]?.verification, "indexed-unverified");
      assert.strictEqual(page.items[0]?.address, owner);
    }),
  );

  it.effect("maps search input to the portable name filter", () =>
    Effect.gen(function* () {
      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        assert.deepInclude(request.variables.where, { labelName_starts_with_nocase: "ali" });

        return Promise.resolve(
          response({ data: { _meta: { block: { number: 100 } }, domains: [] } }),
        );
      };

      const config = createConfig({
        network: "mainnet",
        publicClient: makeMainnetPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const page = yield* searchNames.effect(config, {
        query: "ali",
        mode: "starts-with",
      });

      assert.isEmpty(page.items);
    }),
  );

  it.effect("reads direct V2 children through the parent subregistry", () =>
    Effect.gen(function* () {
      const child = v2Name("child.parent.eth", 10);

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: {
          endpoints: { v1: null },
          fetch: () =>
            Promise.resolve(
              response({
                data: {
                  _meta: { block: { number: 200 } },
                  domain: {
                    subregistry: {
                      labels: [child],
                    },
                  },
                },
              }),
            ),
          retry: { attempts: 0 },
        },
      });

      const page = yield* getSubnames.effect(config, { name: "parent.eth" });

      assert.strictEqual(page.items[0]?.name.kind, "normalized");
      assert.strictEqual(page.items[0]?.source.protocol, "v2");
    }),
  );

  it.effect("reads V1 children and prefers the V2 entity for migrated duplicates", () =>
    Effect.gen(function* () {
      const legacy = { ...v1Name("child.parent.eth", 10), isMigrated: true };
      const migrated = { ...v2Name("child.parent.eth", 10), isMigrated: true };

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        return Promise.resolve(
          request.query.includes("V1GetSubnames")
            ? response({
                data: {
                  _meta: { block: { number: 100 } },
                  domain: {
                    subdomains: [legacy, { ...v1Name("other.parent.eth", 5), isMigrated: true }],
                  },
                },
              })
            : response({
                data: {
                  _meta: { block: { number: 200 } },
                  domain: {
                    subregistry: {
                      labels: [migrated],
                    },
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

      const page = yield* getSubnames.effect(config, { name: "parent.eth" });

      assert.strictEqual(page.items.length, 2);
      assert.strictEqual(page.items[1]?.name.value, "other.parent.eth");
      assert.strictEqual(page.items[0]?.source.protocol, "v2");
    }),
  );

  it.effect("paginates locally when the V2 registry ignores pagination arguments", () =>
    Effect.gen(function* () {
      const children = [
        v2Name("one.parent.eth", 40),
        v2Name("two.parent.eth", 30),
        v2Name("three.parent.eth", 20),
        v2Name("four.parent.eth", 10),
      ];

      const config = createConfig({
        network: "sepolia",
        publicClient: makeSepoliaPublicClient(),
        indexer: {
          endpoints: { v1: null },
          fetch: () =>
            Promise.resolve(
              response({
                data: {
                  _meta: { block: { number: 200 } },
                  domain: { subregistry: { labels: children } },
                },
              }),
            ),
          retry: { attempts: 0 },
        },
      });

      const first = yield* getSubnames.effect(config, { name: "parent.eth", pageSize: 2 });

      assert.isNotNull(first.pageInfo.cursor);

      if (first.pageInfo.cursor === null) return;

      const second = yield* getSubnames.effect(config, {
        name: "parent.eth",
        pageSize: 2,
        cursor: first.pageInfo.cursor,
      });

      assert.deepStrictEqual(
        first.items.map(({ label }) => label),
        ["one", "two"],
      );
      assert.deepStrictEqual(
        second.items.map(({ label }) => label),
        ["three", "four"],
      );
      assert.isFalse(second.pageInfo.hasNextPage);
    }),
  );

  it.effect("recovers encoded labels from exact V1 labelhash evidence", () =>
    Effect.gen(function* () {
      const hash = labelhash("known");
      const encoded = `[${hash.slice(2)}].eth`;

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        return Promise.resolve(
          request.query.includes("V1GetLabel")
            ? response({
                data: {
                  _meta: { block: { number: 100 } },
                  domains: [{ labelName: "known", labelhash: hash }],
                },
              })
            : response({ data: { _meta: { block: { number: 100 } }, domain: null } }),
        );
      };

      const config = createConfig({
        network: "mainnet",
        publicClient: makeMainnetPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const decoded = yield* getDecodedName.effect(config, { name: encoded });

      assert.strictEqual(decoded, "known.eth");
    }),
  );

  it.effect("returns an unresolved encoded name only when explicitly allowed", () =>
    Effect.gen(function* () {
      const hash = labelhash("missing");
      const encoded = `[${hash.slice(2)}].eth`;

      const fetch: typeof globalThis.fetch = (_input, init) => {
        const request = operation(init);

        return Promise.resolve(
          request.query.includes("V1GetLabel")
            ? response({ data: { _meta: { block: { number: 100 } }, domains: [] } })
            : response({ data: { _meta: { block: { number: 100 } }, domain: null } }),
        );
      };

      const config = createConfig({
        network: "mainnet",
        publicClient: makeMainnetPublicClient(),
        indexer: { fetch, retry: { attempts: 0 } },
      });

      const completeOnly = yield* getDecodedName.effect(config, { name: encoded });

      const incomplete = yield* getDecodedName.effect(config, {
        name: encoded,
        allowIncomplete: true,
      });

      assert.isNull(completeOnly);
      assert.strictEqual(incomplete, encoded);
    }),
  );
});
