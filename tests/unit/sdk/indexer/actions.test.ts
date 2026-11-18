import { assert, describe, it } from "@effect/vitest";
import { Array, Effect, Record, String as Str } from "effect";

import * as Actions from "@ensforge/sdk/internal/actions/effect";
import * as PromiseActions from "@ensforge/sdk/internal/actions/indexer/index";
import type { AnyError } from "@ensforge/sdk/internal/errors/types";
import { bigname } from "@ensforge/sdk/internal/indexer/bigname";
import { fallback } from "@ensforge/sdk/internal/indexer/fallback";
import { goldsky } from "@ensforge/sdk/internal/indexer/goldsky";
import { expectFailure } from "@ensforge/test-harness";
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

import { clientWith } from "./client.js";

/** A client on a fake bigname, which reports each failure without retrying. */
const onBigname = () => {
  const fake = fakeBigname();
  const ens = clientWith(bigname({ url: fake.url, fetch: fake.fetch, retryCount: 0 }));
  return { fake, ens };
};

type Client = ReturnType<typeof onBigname>["ens"];

const lastTo = (fake: FakeIndexer, route: Route) => {
  const requests = fake.requestsTo(route);
  return requests[requests.length - 1];
};

describe("indexer actions against bigname", () => {
  // One call per action: the route it hits, a query it sends, and what it reads back.
  it.effect.each<
    [
      string,
      Route,
      (ens: Client) => Effect.Effect<unknown, AnyError>,
      (answer: never, fake: FakeIndexer) => void,
    ]
  >([
    [
      "getName",
      "/names/{name}",
      (ens) => Actions.indexer.getName(ens, { name: "Nick.eth", source: "verified" }),
      (name: Actions.indexer.getName.ReturnType, fake) => {
        assert.strictEqual(name?.owner, addresses.nick);
        assert.strictEqual(name?.asOfToken, "snap_21000000");
        assert.strictEqual(name?.asOf?.blockNumber, 21_000_000n);
        assert.strictEqual(lastTo(fake, "/names/{name}")?.query.get("source"), "verified");
      },
    ],
    [
      "getNamesForAddress",
      "/addresses/{address}/names",
      (ens) =>
        Actions.indexer.getNamesForAddress(ens, {
          address: Str.toLowerCase(addresses.nick),
          relation: "resolvesTo",
          coin: "evm",
        }),
      (page: Actions.indexer.getNamesForAddress.ReturnType, fake) => {
        const request = lastTo(fake, "/addresses/{address}/names");
        assert.strictEqual(request?.params.address, addresses.nick);
        assert.strictEqual(request?.query.get("coin_type"), "evm");
        assert.deepStrictEqual(page.items[0]?.relations, ["owner", "resolvesTo", "roleHolder"]);
      },
    ],
    [
      "getSubnames",
      "/names/{name}/subnames",
      (ens) => Actions.indexer.getSubnames(ens, { name: "nick.eth", limit: 2, includeTotal: true }),
      (page: Actions.indexer.getSubnames.ReturnType) => {
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
      (ens) => Actions.indexer.getHistory(ens, { name: "nick.eth", recordKey: "avatar" }),
      (page: Actions.indexer.getHistory.ReturnType, fake) => {
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
      (ens) => Actions.indexer.getEvents(ens, { name: "NICK.eth", types: ["registration"] }),
      (page: Actions.indexer.getEvents.ReturnType, fake) => {
        assert.strictEqual(lastTo(fake, "/events")?.query.get("name"), "nick.eth");
        assert.deepStrictEqual(
          Array.map(page.items, (event) => event.name),
          ["nick.eth", "nick.eth"],
        );
      },
    ],
    [
      "search",
      "/search",
      (ens) => Actions.indexer.search(ens, { query: "  ALPHA ", match: "contains" }),
      (page: Actions.indexer.search.ReturnType) => {
        assert.deepStrictEqual(
          Array.map(page.items, (item) => item.name),
          ["alpha.nick.eth"],
        );
      },
    ],
    [
      "lookup",
      "/lookup",
      (ens) => Actions.indexer.lookup(ens, { inputs: ["nick.eth", addresses.nick, "nobody.eth"] }),
      (answer: Actions.indexer.lookup.ReturnType, fake) => {
        assert.deepStrictEqual(lastTo(fake, "/lookup")?.body, {
          inputs: [{ name: "nick.eth" }, { address: addresses.nick }, { name: "nobody.eth" }],
        });
        assert.deepStrictEqual(
          Array.map(answer.results, (result) => [result.kind, result.status]),
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
      (ens) =>
        Actions.indexer.getNamesByExpiry(ens, {
          windows: [
            { after: 0n, before: 10n },
            { after: 10n, before: 20n },
          ],
        }),
      (page: Actions.indexer.getNamesByExpiry.ReturnType, fake) => {
        const request = lastTo(fake, "/names");
        assert.deepStrictEqual(request?.query.getAll("expires_window"), ["0..10", "10..20"]);
        assert.strictEqual(request?.query.get("namespace"), "ens");
        assert.deepStrictEqual(
          Array.map(page.items, (item) => item.windowIndex),
          [0, 1],
        );
      },
    ],
    [
      "getPrimaryName",
      "/addresses/{address}/primary-name",
      (ens) => Actions.indexer.getPrimaryName(ens, { address: addresses.nick, coin: "ETH" }),
      (primary: Actions.indexer.getPrimaryName.ReturnType, fake) => {
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
      (ens) => Actions.indexer.getRecords(ens, { name: "nick.eth", keys: ["avatar", "url"] }),
      (records: Actions.indexer.getRecords.ReturnType, fake) => {
        const request = lastTo(fake, "/names/{name}/records");
        assert.strictEqual(request?.query.get("keys"), "text:avatar,text:url");
        assert.strictEqual(request?.query.get("include"), "inventory");
        assert.deepStrictEqual(Record.keys(records?.texts ?? {}), ["avatar"]);
        assert.strictEqual(records?.answers["text:url"]?.status, "notFound");
      },
    ],
    [
      "getPermissions",
      "/permissions",
      (ens) => Actions.indexer.getPermissions(ens, { name: "nick.eth", includeLineage: true }),
      (page: Actions.indexer.getPermissions.ReturnType) => {
        assert.deepStrictEqual(page.items[0]?.powers, ["set_resolver", "admin_renew"]);
      },
    ],
    [
      "getRegistry",
      "/registries/{chain_id}/{address}",
      (ens) =>
        Actions.indexer.getRegistry(ens, {
          address: Str.toLowerCase(addresses.registry),
          includeCounts: true,
        }),
      (registry: Actions.indexer.getRegistry.ReturnType, fake) => {
        const request = lastTo(fake, "/registries/{chain_id}/{address}");
        assert.deepStrictEqual(request?.params, { chain_id: "1", address: addresses.registry });
        assert.strictEqual(request?.query.get("include"), "counts");
        assert.deepStrictEqual(registry?.counts, { labels: 3, roles: 4, events: 12 });
      },
    ],
    [
      "getRegistryLabels",
      "/registries/{chain_id}/{address}/labels",
      (ens) =>
        Actions.indexer.getRegistryLabels(ens, {
          address: addresses.registry,
          owner: addresses.nick,
        }),
      (page: Actions.indexer.getRegistryLabels.ReturnType) => {
        assert.deepStrictEqual(
          Array.map(page.items, (label) => [label.authority, label.roleHolderCount]),
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
      (ens) => Actions.indexer.getResolver(ens, { address: addresses.resolverV2 }),
      (resolver: Actions.indexer.getResolver.ReturnType) => {
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
      (ens) => Actions.indexer.getResolverLinks(ens, { address: addresses.resolverV2 }),
      (page: Actions.indexer.getResolverLinks.ReturnType) => {
        assert.deepStrictEqual(
          Array.map(page.items, (link) => [link.name, link.isDefault, link.blockNumber]),
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
      (ens) =>
        Actions.indexer.getResolverRoles(ens, { address: addresses.resolverV2, chainId: 10 }),
      (page: Actions.indexer.getResolverRoles.ReturnType, fake) => {
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
      (ens) => Actions.indexer.getResolvers(ens, { roleHolder: Str.toLowerCase(addresses.nick) }),
      (page: Actions.indexer.getResolvers.ReturnType, fake) => {
        assert.strictEqual(lastTo(fake, "/resolvers")?.query.get("role_holder"), addresses.nick);
        assert.strictEqual(page.items[0]?.address, addresses.resolverV2);
      },
    ],
    [
      "getNamespace",
      "/namespaces/{namespace}",
      (ens) => Actions.indexer.getNamespace(ens, {}),
      (info: Actions.indexer.getNamespace.ReturnType) => {
        assert.strictEqual(info?.networks[0]?.protocol, "ensV1");
        assert.strictEqual(info?.capabilities.history, "partial");
      },
    ],
    [
      "getStatus",
      "/status",
      (ens) => Actions.indexer.getStatus(ens, {}),
      (status: Actions.indexer.getStatus.ReturnType) => {
        assert.strictEqual(status.indexer, "bigname");
        assert.strictEqual(status.chains[1]?.indexed, 21_000_000n);
      },
    ],
  ])("%s calls %s", ([, route, call, check]) =>
    Effect.gen(function* () {
      const { fake, ens } = onBigname();

      const answer = yield* call(ens);

      assert.isDefined(lastTo(fake, route));
      // Each row pairs its call with a check typed for that call's answer.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      check(answer as never, fake);
    }),
  );

  it.effect("probes the indexer once, then sends only queries", () =>
    Effect.gen(function* () {
      const { fake, ens } = onBigname();

      yield* Actions.indexer.getName(ens, { name: "nick.eth" });
      yield* Actions.indexer.getSubnames(ens, { name: "nick.eth" });

      assert.deepStrictEqual(
        Array.map(fake.requests, (request) => request.route),
        ["/namespaces/{namespace}", "/status", "/names/{name}", "/names/{name}/subnames"],
      );
    }),
  );

  // Promise API conformance: the standalone and bound forms are Promises.
  // oxlint-disable-next-line effecttsgo/async-function
  it("reads a name through the standalone and Effect forms alike", async () => {
    const { ens } = onBigname();

    const bound = await ens.indexer.getName({ name: "nick.eth" });
    const standalone = await PromiseActions.getName(ens, { name: "nick.eth" });
    const effect = await Effect.runPromise(Actions.indexer.getName(ens, { name: "nick.eth" }));

    assert.deepStrictEqual(standalone, bound);
    assert.deepStrictEqual(effect, bound);
    assert.strictEqual(bound?.node, nick.namehash);
  });

  it.effect("returns null for unknown resources, or NotFoundError with strict", () =>
    Effect.gen(function* () {
      const { ens } = onBigname();
      const unknown = "0x000000000000000000000000000000000000dEaD";

      const name = yield* Actions.indexer.getName(ens, { name: "nobody.eth" });
      const records = yield* Actions.indexer.getRecords(ens, { name: "nobody.eth" });
      const registry = yield* Actions.indexer.getRegistry(ens, { address: unknown });
      const resolver = yield* Actions.indexer.getResolver(ens, { address: unknown });
      const namespace = yield* Actions.indexer.getNamespace(ens, { namespace: "basenames" });
      assert.isNull(name);
      assert.isNull(records);
      assert.isNull(registry);
      assert.isNull(resolver);
      assert.isNull(namespace);

      const error = yield* expectFailure(
        Actions.indexer.getName(ens, { name: "nobody.eth", strict: true }),
        { _tag: "NotFoundError", code: "INDEXER_NOT_FOUND" },
      );
      assert.strictEqual(error.resource, "nobody.eth");
    }),
  );

  it.effect("lists of unknown subjects fail with INDEXER_NOT_FOUND", () =>
    Effect.gen(function* () {
      const { ens } = onBigname();
      yield* expectFailure(Actions.indexer.getSubnames(ens, { name: "nobody.eth" }), {
        _tag: "NotFoundError",
        code: "INDEXER_NOT_FOUND",
      });
    }),
  );

  it.effect("reads records on a given resolver", () =>
    Effect.gen(function* () {
      const { fake, ens } = onBigname();

      yield* Actions.indexer.getRecords(ens, {
        name: "nick.eth",
        resolver: { address: Str.toLowerCase(addresses.resolverV2) },
      });

      const request = lastTo(fake, "/resolvers/{chain_id}/{address}/records");
      assert.deepStrictEqual(request?.params, { chain_id: "1", address: addresses.resolverV2 });
      assert.strictEqual(request?.query.get("name"), "nick.eth");
    }),
  );

  it.effect("reads history for an address and snapshot reads with a token", () =>
    Effect.gen(function* () {
      const { fake, ens } = onBigname();

      const page = yield* Actions.indexer.getHistory(ens, { address: addresses.nick });
      yield* Actions.indexer.getName(ens, {
        name: "nick.eth",
        at: { token: "snap_1" },
        finality: "safe",
      });

      assert.strictEqual(page.items.length, 2);
      const request = lastTo(fake, "/names/{name}");
      assert.deepStrictEqual(
        [request?.query.get("at"), request?.query.get("finality")],
        ["snap_1", "safe"],
      );
    }),
  );

  it.effect("fails with a typed error when an answer does not decode or map", () =>
    Effect.gen(function* () {
      const { fake, ens } = onBigname();
      fake.on("/names/{name}", reply.envelope({ data: { ...nick, owner: "0x1234" } }));
      fake.on("/names/{name}/subnames", reply.envelope({ data: [{ name: "a.nick.eth" }] }));

      yield* expectFailure(Actions.indexer.getName(ens, { name: "nick.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_RESPONSE_INVALID",
      });
      yield* expectFailure(Actions.indexer.getSubnames(ens, { name: "nick.eth" }), {
        _tag: "IndexerError",
        code: "INDEXER_RESPONSE_INVALID",
      });
    }),
  );
});

describe("indexer action input", () => {
  it.effect.each<[string, (ens: Client) => Effect.Effect<unknown, AnyError>, string]>([
    [
      "getName with the root",
      (ens: Client) => Actions.indexer.getName(ens, { name: "" }),
      "INVALID_NAME",
    ],
    [
      "getName with an invalid name",
      (ens: Client) => Actions.indexer.getName(ens, { name: "a..eth" }),
      "INVALID_NAME",
    ],
    [
      "getPrimaryName with a bad address",
      (ens: Client) => Actions.indexer.getPrimaryName(ens, { address: "0x12" }),
      "INVALID_ADDRESS",
    ],
    [
      "indexer.getPrimaryName with an unknown coin",
      (ens: Client) =>
        Actions.indexer.getPrimaryName(ens, { address: addresses.nick, coin: "nope" }),
      "INVALID_COIN_TYPE",
    ],
    [
      "indexer.getNamesForAddress with an unknown coin",
      (ens: Client) =>
        Actions.indexer.getNamesForAddress(ens, { address: addresses.nick, coin: "nope" }),
      "INVALID_COIN_TYPE",
    ],
    [
      "search with a blank query",
      (ens: Client) => Actions.indexer.search(ens, { query: "  " }),
      "INVALID_RECORD_VALUE",
    ],
    [
      "lookup without inputs",
      (ens: Client) => Actions.indexer.lookup(ens, { inputs: [] }),
      "INVALID_RECORD_VALUE",
    ],
    [
      "lookup with 1,001 inputs",
      (ens: Client) =>
        Actions.indexer.lookup(ens, {
          inputs: Array.replicate("a.eth", 1001),
        }),
      "INVALID_RECORD_VALUE",
    ],
    [
      "getPermissions with two subjects",
      (ens: Client) =>
        Actions.indexer.getPermissions(ens, { name: "a.eth", address: addresses.nick }),
      "INVALID_RECORD_VALUE",
    ],
    [
      "getPermissions without a subject",
      (ens: Client) => Actions.indexer.getPermissions(ens, {}),
      "INVALID_RECORD_VALUE",
    ],
  ])("rejects %s before any request", ([, call, code]) =>
    Effect.gen(function* () {
      const { fake, ens } = onBigname();

      yield* expectFailure(call(ens).pipe(Effect.asVoid), {
        _tag: "InvalidInputError",
        code,
      });
      assert.lengthOf(fake.requests, 0);
    }),
  );
});

const onGoldsky = () => {
  const fake = fakeGoldsky();
  const ens = clientWith(goldsky({ url: fake.url, fetch: fake.fetch, retryCount: 0 }));
  return { fake, ens };
};

describe("indexer actions against Goldsky", () => {
  it.effect("reads Basenames from Base, at Base's snapshot", () =>
    Effect.gen(function* () {
      const { ens } = onGoldsky();

      const name = yield* Actions.indexer.getName(ens, { name: "jesse.base.eth" });

      assert.strictEqual(name?.namespace, "basenames");
      assert.strictEqual(name?.owner, jesse);
      assert.strictEqual(name?.asOf?.chainId, 8453);
    }),
  );

  it.effect.each([
    { label: "a snapshot", options: { at: { token: "t" } } },
    { label: "safe finality", options: { finality: "safe" as const } },
  ])("rejects $label without a request", ({ options }) =>
    Effect.gen(function* () {
      const { fake, ens } = onGoldsky();

      yield* expectFailure(Actions.indexer.getName(ens, { name: "nick.eth", ...options }), {
        _tag: "IndexerError",
        code: "INDEXER_UNSUPPORTED",
      });
      assert.lengthOf(fake.requests, 0);
    }),
  );

  it.effect("does not serve getResolvers", () =>
    Effect.gen(function* () {
      const { ens } = onGoldsky();
      yield* expectFailure(Actions.indexer.getResolvers(ens, { roleHolder: addresses.nick }), {
        _tag: "IndexerError",
        code: "INDEXER_UNSUPPORTED",
      });
    }),
  );
});

describe("bigname before the role-holder route (v0.13)", () => {
  // Sepolia's hosted bigname ran v0.13.0 when v0.14 added `GET /resolvers?role_holder=`.
  it.effect("reports getResolvers unsupported, and the next indexer answers it", () =>
    Effect.gen(function* () {
      const old = fakeBigname({ without: ["/resolvers"] });
      const current = fakeBigname();
      yield* expectFailure(
        Actions.indexer.getResolvers(clientWith(bigname({ url: old.url, fetch: old.fetch })), {
          roleHolder: addresses.nick,
        }),
        { _tag: "IndexerError", code: "INDEXER_UNSUPPORTED" },
      );

      const ens = clientWith(
        fallback([
          bigname({ url: old.url, fetch: old.fetch }),
          bigname({ url: current.url, fetch: current.fetch }),
        ]),
      );
      const page = yield* Actions.indexer.getResolvers(ens, {
        roleHolder: addresses.nick,
      });
      assert.strictEqual(page.items[0]?.address, addresses.resolverV2);
    }),
  );
});

describe("bigname and Goldsky together", () => {
  it.effect("sends Basenames to Goldsky and ENS to bigname", () =>
    Effect.gen(function* () {
      const big = fakeBigname();
      const gold = fakeGoldsky();
      const ens = clientWith(
        fallback([
          bigname({ url: big.url, fetch: big.fetch }),
          goldsky({ url: gold.url, fetch: gold.fetch }),
        ]),
      );

      const basename = yield* Actions.indexer.getName(ens, { name: "jesse.base.eth" });
      const ensName = yield* Actions.indexer.getName(ens, { name: "nick.eth" });

      assert.strictEqual(basename?.indexer, "goldsky");
      assert.strictEqual(ensName?.indexer, "bigname");
      assert.deepStrictEqual(
        Array.map(big.requestsTo("/names/{name}"), (request) => request.params.name),
        ["nick.eth"],
      );
      assert.deepStrictEqual(
        Array.map(gold.requestsTo("/names/{name}"), (request) => request.params.name),
        ["jesse.base.eth"],
      );
    }),
  );

  it.effect("moves to Goldsky when bigname is down, and keeps paging there", () =>
    Effect.gen(function* () {
      const big = fakeBigname();
      const gold = fakeGoldsky();
      big.on("*", reply.error(503, "overloaded"));
      const ens = clientWith(
        fallback([
          bigname({ url: big.url, fetch: big.fetch, retryCount: 0 }),
          goldsky({ url: gold.url, fetch: gold.fetch }),
        ]),
      );

      const first = yield* Actions.indexer.getSubnames(ens, { name: "nick.eth", limit: 2 });
      const second = yield* Actions.indexer.getSubnames(ens, {
        name: "nick.eth",
        cursor: first.cursor ?? "",
      });

      assert.strictEqual(first.cursor, "f1:c2");
      assert.strictEqual(second.indexer, "goldsky");
      assert.strictEqual(gold.requestsTo("/names/{name}/subnames")[1]?.query.get("cursor"), "c2");
      assert.lengthOf(big.requests, 1);
    }),
  );

  it.effect("rejects a client on a chain the indexer does not serve", () => {
    const fake = fakeBigname();
    const ens = clientWith(bigname({ url: fake.url, fetch: fake.fetch }), sepolia);

    return expectFailure(Actions.indexer.getName(ens, { name: "nick.eth" }), {
      _tag: "IndexerError",
      code: "INDEXER_UNSUPPORTED",
    });
  });

  it.effect("has no public host for other chains without a url", () => {
    const ens = clientWith(goldsky(), sepolia);

    return expectFailure(Actions.indexer.getStatus(ens, {}), {
      _tag: "IndexerError",
      code: "INDEXER_UNSUPPORTED",
    });
  });
});
