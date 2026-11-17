import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { expectFailure, expectRejection } from "@ensforge/test-harness";
import {
  fakeBigname,
  fakeGoldsky,
  reply,
  type FakeIndexer,
} from "@ensforge/test-harness/indexer/fake-bigname";
import { addresses, nick } from "@ensforge/test-harness/indexer/fixtures/bigname";
import { jesse } from "@ensforge/test-harness/indexer/fixtures/goldsky";
import type { Route } from "@ensforge/test-harness/indexer/routes";
import { sepolia } from "viem/chains";

import * as EffectActions from "#/actions/effect";
import * as Actions from "#/actions/indexer/index";
import { bigname } from "#/indexer/bigname";
import { fallback } from "#/indexer/fallback";
import { goldsky } from "#/indexer/goldsky";

import { clientWith } from "./client.js";

const setup = (options: Parameters<typeof fakeBigname>[0] = {}) => {
  const fake = fakeBigname(options);
  const client = clientWith(bigname({ url: fake.url, fetch: fake.fetch, retryCount: 0 }));
  return { fake, client };
};

type Client = ReturnType<typeof setup>["client"];

const lastTo = (fake: FakeIndexer, route: Route) => {
  const requests = fake.requestsTo(route);
  return requests[requests.length - 1];
};

describe("indexer actions against bigname", () => {
  // One call per action through the bound client: the route it hits, a query it sends, and what it reads back.
  it.each<
    [
      string,
      Route,
      (client: Client) => Promise<unknown>,
      (answer: never, fake: FakeIndexer) => void,
    ]
  >([
    [
      "getName",
      "/names/{name}",
      (client) => client.indexer.getName({ name: "Nick.eth", source: "verified" }),
      (name: Awaited<ReturnType<typeof Actions.getName>>, fake) => {
        assert.strictEqual(name?.owner, addresses.nick);
        assert.strictEqual(name?.asOfToken, "snap_21000000");
        assert.strictEqual(name?.asOf?.blockNumber, 21_000_000n);
        assert.strictEqual(lastTo(fake, "/names/{name}")?.query.get("source"), "verified");
      },
    ],
    [
      "getNamesForAddress",
      "/addresses/{address}/names",
      (client) =>
        client.indexer.getNamesForAddress({
          address: addresses.nick.toLowerCase(),
          relation: "resolvesTo",
          coin: "evm",
        }),
      (page: Awaited<ReturnType<typeof Actions.getNamesForAddress>>, fake) => {
        const request = lastTo(fake, "/addresses/{address}/names");
        assert.strictEqual(request?.params.address, addresses.nick);
        assert.strictEqual(request?.query.get("coin_type"), "evm");
        assert.deepStrictEqual(page.items[0]?.relations, ["owner", "resolvesTo", "roleHolder"]);
      },
    ],
    [
      "getSubnames",
      "/names/{name}/subnames",
      (client) => client.indexer.getSubnames({ name: "nick.eth", limit: 2, includeTotal: true }),
      (page: Awaited<ReturnType<typeof Actions.getSubnames>>) => {
        assert.deepStrictEqual(
          [page.items.length, page.cursor, page.hasMore, page.totalCount],
          [2, "c2", true, 3],
        );
        assert.strictEqual(page.items[0]?.expiryReason, "noExpiry");
      },
    ],
    [
      "getHistory",
      "/names/{name}/history",
      (client) => client.indexer.getHistory({ name: "nick.eth", recordKey: "avatar" }),
      (page: Awaited<ReturnType<typeof Actions.getHistory>>, fake) => {
        assert.strictEqual(
          lastTo(fake, "/names/{name}/history")?.query.get("record_key"),
          "avatar",
        );
        assert.strictEqual(page.items[0]?.action, "record_changed");
        assert.strictEqual(page.items[0]?.contract, addresses.publicResolver);
      },
    ],
    [
      "getEvents",
      "/events",
      (client) => client.indexer.getEvents({ name: "NICK.eth", types: ["registration"] }),
      (page: Awaited<ReturnType<typeof Actions.getEvents>>, fake) => {
        assert.strictEqual(lastTo(fake, "/events")?.query.get("name"), "nick.eth");
        assert.deepStrictEqual(
          page.items.map((event) => event.name),
          ["nick.eth", "nick.eth"],
        );
      },
    ],
    [
      "search",
      "/search",
      (client) => client.indexer.search({ query: "  ALPHA ", match: "contains" }),
      (page: Awaited<ReturnType<typeof Actions.search>>) => {
        assert.deepStrictEqual(
          page.items.map((item) => item.name),
          ["alpha.nick.eth"],
        );
      },
    ],
    [
      "lookup",
      "/lookup",
      (client) => client.indexer.lookup({ inputs: ["nick.eth", addresses.nick, "nobody.eth"] }),
      (answer: Awaited<ReturnType<typeof Actions.lookup>>, fake) => {
        assert.deepStrictEqual(lastTo(fake, "/lookup")?.body, {
          inputs: [{ name: "nick.eth" }, { address: addresses.nick }, { name: "nobody.eth" }],
        });
        assert.deepStrictEqual(
          answer.results.map((result) => [result.kind, result.status]),
          [
            ["name", "ok"],
            ["address", "ok"],
            ["name", "notFound"],
          ],
        );
        assert.strictEqual(answer.results[1]?.name?.isPrimary, true);
      },
    ],
    [
      "getNamesByExpiry",
      "/names",
      (client) =>
        client.indexer.getNamesByExpiry({
          windows: [
            { after: 0n, before: 10n },
            { after: 10n, before: 20n },
          ],
        }),
      (page: Awaited<ReturnType<typeof Actions.getNamesByExpiry>>, fake) => {
        const request = lastTo(fake, "/names");
        assert.deepStrictEqual(request?.query.getAll("expires_window"), ["0..10", "10..20"]);
        assert.strictEqual(request?.query.get("namespace"), "ens");
        assert.deepStrictEqual(
          page.items.map((item) => item.windowIndex),
          [0, 1],
        );
      },
    ],
    [
      "getPrimaryName",
      "/addresses/{address}/primary-name",
      (client) => client.indexer.getPrimaryName({ address: addresses.nick, coin: "ETH" }),
      (primary: Awaited<ReturnType<typeof Actions.getPrimaryName>>, fake) => {
        assert.strictEqual(
          lastTo(fake, "/addresses/{address}/primary-name")?.query.get("coin_type"),
          "60",
        );
        assert.deepStrictEqual([primary.name, primary.source], ["nick.eth", "verified"]);
      },
    ],
    [
      "getRecords",
      "/names/{name}/records",
      (client) => client.indexer.getRecords({ name: "nick.eth", keys: ["avatar", "url"] }),
      (records: Awaited<ReturnType<typeof Actions.getRecords>>, fake) => {
        const request = lastTo(fake, "/names/{name}/records");
        assert.strictEqual(request?.query.get("keys"), "text:avatar,text:url");
        assert.strictEqual(request?.query.get("include"), "inventory");
        assert.deepStrictEqual(Object.keys(records?.texts ?? {}), ["avatar"]);
        assert.strictEqual(records?.answers["text:url"]?.status, "notFound");
      },
    ],
    [
      "getPermissions",
      "/permissions",
      (client) => client.indexer.getPermissions({ name: "nick.eth", includeLineage: true }),
      (page: Awaited<ReturnType<typeof Actions.getPermissions>>) => {
        assert.deepStrictEqual(page.items[0]?.powers, ["set_resolver", "admin_renew"]);
      },
    ],
    [
      "getRegistry",
      "/registries/{chain_id}/{address}",
      (client) =>
        client.indexer.getRegistry({
          address: addresses.registry.toLowerCase(),
          includeCounts: true,
        }),
      (registry: Awaited<ReturnType<typeof Actions.getRegistry>>, fake) => {
        const request = lastTo(fake, "/registries/{chain_id}/{address}");
        assert.deepStrictEqual(request?.params, { chain_id: "1", address: addresses.registry });
        assert.strictEqual(request?.query.get("include"), "counts");
        assert.deepStrictEqual(registry?.counts, { labels: 3, roles: 4, events: 12 });
      },
    ],
    [
      "getRegistryLabels",
      "/registries/{chain_id}/{address}/labels",
      (client) =>
        client.indexer.getRegistryLabels({ address: addresses.registry, owner: addresses.nick }),
      (page: Awaited<ReturnType<typeof Actions.getRegistryLabels>>) => {
        assert.deepStrictEqual(
          page.items.map((label) => [label.authority, label.roleHolderCount]),
          [
            ["ensV2", 1],
            ["ensV2", 1],
            ["ensV2", 1],
          ],
        );
      },
    ],
    [
      "getResolver",
      "/resolvers/{chain_id}/{address}",
      (client) => client.indexer.getResolver({ address: addresses.resolverV2 }),
      (resolver: Awaited<ReturnType<typeof Actions.getResolver>>) => {
        assert.deepStrictEqual(
          [resolver?.names, resolver?.cursor, resolver?.hasMore],
          [["nick.eth"], "c1", true],
        );
        assert.deepStrictEqual(resolver?.mirrors, {
          chainId: 1,
          address: addresses.publicResolver,
        });
      },
    ],
    [
      "getResolverLinks",
      "/resolvers/{chain_id}/{address}/links",
      (client) => client.indexer.getResolverLinks({ address: addresses.resolverV2 }),
      (page: Awaited<ReturnType<typeof Actions.getResolverLinks>>) => {
        assert.deepStrictEqual(
          page.items.map((link) => [link.name, link.isDefault, link.blockNumber]),
          [
            ["nick.eth", true, 21_600_000n],
            ["", false, null],
          ],
        );
      },
    ],
    [
      "getResolverRoles",
      "/resolvers/{chain_id}/{address}/roles",
      (client) => client.indexer.getResolverRoles({ address: addresses.resolverV2, chainId: 10 }),
      (page: Awaited<ReturnType<typeof Actions.getResolverRoles>>, fake) => {
        assert.strictEqual(
          lastTo(fake, "/resolvers/{chain_id}/{address}/roles")?.params.chain_id,
          "10",
        );
        assert.strictEqual(page.items[0]?.address, addresses.manager);
      },
    ],
    [
      "getResolvers",
      "/resolvers",
      (client) => client.indexer.getResolvers({ roleHolder: addresses.nick.toLowerCase() }),
      (page: Awaited<ReturnType<typeof Actions.getResolvers>>, fake) => {
        assert.strictEqual(lastTo(fake, "/resolvers")?.query.get("role_holder"), addresses.nick);
        assert.strictEqual(page.items[0]?.address, addresses.resolverV2);
      },
    ],
    [
      "getNamespace",
      "/namespaces/{namespace}",
      (client) => client.indexer.getNamespace({}),
      (info: Awaited<ReturnType<typeof Actions.getNamespace>>) => {
        assert.strictEqual(info?.networks[0]?.protocol, "ensV1");
        assert.strictEqual(info?.capabilities.history, "partial");
      },
    ],
    [
      "getStatus",
      "/status",
      (client) => client.indexer.getStatus({}),
      (status: Awaited<ReturnType<typeof Actions.getStatus>>) => {
        assert.strictEqual(status.indexer, "bigname");
        assert.strictEqual(status.chains[1]?.indexed, 21_000_000n);
      },
    ],
  ])("%s calls %s", async (_, route, call, check) => {
    const { fake, client } = setup();

    const answer = await call(client);

    assert.isDefined(lastTo(fake, route));
    check(answer as never, fake);
  });

  it("probes the indexer once, then sends only queries", async () => {
    const { fake, client } = setup();

    await client.indexer.getName({ name: "nick.eth" });
    await client.indexer.getSubnames({ name: "nick.eth" });

    assert.deepStrictEqual(
      fake.requests.map((request) => request.route),
      ["/namespaces/{namespace}", "/status", "/names/{name}", "/names/{name}/subnames"],
    );
  });

  it("reads a name through the standalone and Effect forms alike", async () => {
    const { client } = setup();

    const bound = await client.indexer.getName({ name: "nick.eth" });
    const standalone = await Actions.getName(client, { name: "nick.eth" });
    const effect = await Effect.runPromise(
      EffectActions.indexer.getName(client, { name: "nick.eth" }),
    );

    assert.deepStrictEqual(standalone, bound);
    assert.deepStrictEqual(effect, bound);
    assert.strictEqual(bound?.node, nick.namehash);
  });

  it.effect("returns null for unknown resources, or NotFoundError with strict", () =>
    Effect.gen(function* () {
      const { client } = setup();
      const unknown = "0x000000000000000000000000000000000000dEaD";

      assert.isNull(yield* EffectActions.indexer.getName(client, { name: "nobody.eth" }));
      assert.isNull(yield* EffectActions.indexer.getRecords(client, { name: "nobody.eth" }));
      assert.isNull(yield* EffectActions.indexer.getRegistry(client, { address: unknown }));
      assert.isNull(yield* EffectActions.indexer.getResolver(client, { address: unknown }));
      assert.isNull(yield* EffectActions.indexer.getNamespace(client, { namespace: "basenames" }));

      const error = yield* expectFailure(
        EffectActions.indexer.getName(client, { name: "nobody.eth", strict: true }),
        { _tag: "NotFoundError", code: "INDEXER_NOT_FOUND" },
      );
      assert.strictEqual((error as unknown as { resource: string }).resource, "nobody.eth");
    }),
  );

  it.effect("lists of unknown subjects fail with INDEXER_NOT_FOUND", () =>
    Effect.gen(function* () {
      const { client } = setup();
      yield* expectFailure(EffectActions.indexer.getSubnames(client, { name: "nobody.eth" }), {
        _tag: "NotFoundError",
        code: "INDEXER_NOT_FOUND",
      });
    }),
  );

  it("reads records on a given resolver", async () => {
    const { fake, client } = setup();

    await client.indexer.getRecords({
      name: "nick.eth",
      resolver: { address: addresses.resolverV2.toLowerCase() },
    });

    const request = lastTo(fake, "/resolvers/{chain_id}/{address}/records");
    assert.deepStrictEqual(request?.params, { chain_id: "1", address: addresses.resolverV2 });
    assert.strictEqual(request?.query.get("name"), "nick.eth");
  });

  it("reads history for an address and snapshot reads with a token", async () => {
    const { fake, client } = setup();

    const page = await client.indexer.getHistory({ address: addresses.nick });
    await client.indexer.getName({ name: "nick.eth", at: { token: "snap_1" }, finality: "safe" });

    assert.strictEqual(page.items.length, 2);
    const request = lastTo(fake, "/names/{name}");
    assert.deepStrictEqual(
      [request?.query.get("at"), request?.query.get("finality")],
      ["snap_1", "safe"],
    );
  });

  it.effect("fails with a typed error when an answer does not decode or map", () =>
    Effect.gen(function* () {
      const { fake, client } = setup();
      fake.on("/names/{name}", reply.envelope({ data: { ...nick, owner: "0x1234" } }));
      fake.on("/names/{name}/subnames", reply.envelope({ data: [{ name: "a.nick.eth" }] }));

      yield* expectFailure(EffectActions.indexer.getName(client, { name: "nick.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_RESPONSE_INVALID",
      });
      yield* expectFailure(EffectActions.indexer.getSubnames(client, { name: "nick.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_RESPONSE_INVALID",
      });
    }),
  );
});

describe("indexer action input", () => {
  it.effect.each([
    [
      "getName with the root",
      (client: Client) => EffectActions.indexer.getName(client, { name: "" }),
      "INVALID_NAME",
    ],
    [
      "getName with an invalid name",
      (client: Client) => EffectActions.indexer.getName(client, { name: "a..eth" }),
      "INVALID_NAME",
    ],
    [
      "getPrimaryName with a bad address",
      (client: Client) => EffectActions.indexer.getPrimaryName(client, { address: "0x12" }),
      "INVALID_ADDRESS",
    ],
    [
      "indexer.getPrimaryName with an unknown coin",
      (client: Client) =>
        EffectActions.indexer.getPrimaryName(client, { address: addresses.nick, coin: "nope" }),
      "INVALID_COIN_TYPE",
    ],
    [
      "indexer.getNamesForAddress with an unknown coin",
      (client: Client) =>
        EffectActions.indexer.getNamesForAddress(client, { address: addresses.nick, coin: "nope" }),
      "INVALID_COIN_TYPE",
    ],
    [
      "search with a blank query",
      (client: Client) => EffectActions.indexer.search(client, { query: "  " }),
      "INVALID_RECORD_VALUE",
    ],
    [
      "lookup without inputs",
      (client: Client) => EffectActions.indexer.lookup(client, { inputs: [] }),
      "INVALID_RECORD_VALUE",
    ],
    [
      "lookup with 1,001 inputs",
      (client: Client) =>
        EffectActions.indexer.lookup(client, {
          inputs: Array.from({ length: 1001 }, () => "a.eth"),
        }),
      "INVALID_RECORD_VALUE",
    ],
    [
      "getPermissions with two subjects",
      (client: Client) =>
        EffectActions.indexer.getPermissions(client, { name: "a.eth", address: addresses.nick }),
      "INVALID_RECORD_VALUE",
    ],
    [
      "getPermissions without a subject",
      (client: Client) => EffectActions.indexer.getPermissions(client, {}),
      "INVALID_RECORD_VALUE",
    ],
  ] as const)("rejects %s before any request", ([, call, code]) =>
    Effect.gen(function* () {
      const { fake, client } = setup();

      yield* expectFailure(call(client) as Effect.Effect<unknown, unknown>, {
        _tag: "InvalidInputError",
        code,
      });
      assert.lengthOf(fake.requests, 0);
    }),
  );
});

const goldskySetup = () => {
  const fake = fakeGoldsky();
  const client = clientWith(goldsky({ url: fake.url, fetch: fake.fetch, retryCount: 0 }));
  return { fake, client };
};

describe("indexer actions against Goldsky", () => {
  it("reads Basenames from Base, at Base's snapshot", async () => {
    const { client } = goldskySetup();

    const name = await client.indexer.getName({ name: "jesse.base.eth" });

    assert.strictEqual(name?.namespace, "basenames");
    assert.strictEqual(name?.owner, jesse);
    assert.strictEqual(name?.asOf?.chainId, 8453);
  });

  it.effect.each([
    { label: "a snapshot", options: { at: { token: "t" } } },
    { label: "safe finality", options: { finality: "safe" as const } },
  ])("rejects $label without a request", ({ options }) =>
    Effect.gen(function* () {
      const { fake, client } = goldskySetup();

      yield* expectFailure(
        EffectActions.indexer.getName(client, { name: "nick.eth", ...options }),
        { _tag: "IndexerError", code: "INDEXER_UNSUPPORTED" },
      );
      assert.lengthOf(fake.requests, 0);
    }),
  );

  it.effect("does not serve getResolvers", () =>
    Effect.gen(function* () {
      const { client } = goldskySetup();
      yield* expectFailure(
        EffectActions.indexer.getResolvers(client, { roleHolder: addresses.nick }),
        { _tag: "IndexerError", code: "INDEXER_UNSUPPORTED" },
      );
    }),
  );
});

describe("bigname and Goldsky together", () => {
  it("sends Basenames to Goldsky and ENS to bigname", async () => {
    const big = fakeBigname();
    const gold = fakeGoldsky();
    const client = clientWith(
      fallback([
        bigname({ url: big.url, fetch: big.fetch }),
        goldsky({ url: gold.url, fetch: gold.fetch }),
      ]),
    );

    const basename = await client.indexer.getName({ name: "jesse.base.eth" });
    const ens = await client.indexer.getName({ name: "nick.eth" });

    assert.strictEqual(basename?.indexer, "goldsky");
    assert.strictEqual(ens?.indexer, "bigname");
    assert.deepStrictEqual(
      big.requestsTo("/names/{name}").map((request) => request.params.name),
      ["nick.eth"],
    );
    assert.deepStrictEqual(
      gold.requestsTo("/names/{name}").map((request) => request.params.name),
      ["jesse.base.eth"],
    );
  });

  it("moves to Goldsky when bigname is down, and keeps paging there", async () => {
    const big = fakeBigname();
    const gold = fakeGoldsky();
    big.on("*", reply.error(503, "overloaded"));
    const client = clientWith(
      fallback([
        bigname({ url: big.url, fetch: big.fetch, retryCount: 0 }),
        goldsky({ url: gold.url, fetch: gold.fetch }),
      ]),
    );

    const first = await client.indexer.getSubnames({ name: "nick.eth", limit: 2 });
    const second = await client.indexer.getSubnames({
      name: "nick.eth",
      cursor: first.cursor ?? "",
    });

    assert.strictEqual(first.cursor, "f1:c2");
    assert.strictEqual(second.indexer, "goldsky");
    assert.strictEqual(gold.requestsTo("/names/{name}/subnames")[1]?.query.get("cursor"), "c2");
    assert.lengthOf(big.requests, 1);
  });

  it("rejects a client on a chain the indexer does not serve", async () => {
    const { fake } = setup();
    const client = clientWith(bigname({ url: fake.url, fetch: fake.fetch }), sepolia);

    await Effect.runPromise(
      expectRejection(() => client.indexer.getName({ name: "nick.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_UNSUPPORTED",
      }),
    );
  });

  it("has no public host for other chains without a url", async () => {
    const client = clientWith(goldsky(), sepolia);

    await Effect.runPromise(
      expectRejection(() => client.indexer.getStatus({}), {
        _tag: "IndexerError",
        code: "INDEXER_UNSUPPORTED",
      }),
    );
  });
});
