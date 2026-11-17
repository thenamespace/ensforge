import { assert, describe, it } from "@effect/vitest";

import * as Fixture from "@ensforge/test-harness/indexer/fixtures/bigname";

import * as Convert from "#/internal/indexer/map";

const { addresses } = Fixture;
const row = { name: "a.eth", namehash: "0x01" };

const asOf = (block: number) => ({
  block_number: block,
  block_hash: "0xaa",
  timestamp: String(block * 12),
});

describe("Convert.meta", () => {
  it("picks the answer's chain among its snapshots", () => {
    const meta = Convert.meta({ as_of: { "1": asOf(10), "8453": asOf(20) } }, 8453, "goldsky");

    assert.deepStrictEqual(meta.asOf, {
      chainId: 8453,
      blockNumber: 20n,
      blockHash: "0xaa",
      timestamp: 240n,
    });
    assert.deepStrictEqual(Object.keys(meta.snapshots), ["1", "8453"]);
  });

  it("falls back to the first snapshot, then to null", () => {
    assert.strictEqual(Convert.meta({ as_of: { "1": asOf(10) } }, 5, "x").asOf?.chainId, 1);
    assert.isNull(Convert.meta(undefined, 1, "x").asOf);
  });

  it("defaults a missing or unknown completeness to full, and an unknown source to null", () => {
    const meta = Convert.meta({ completeness: "mostly", source: "cached" }, 1, "bigname");

    assert.deepStrictEqual(meta, {
      asOf: null,
      snapshots: {},
      asOfToken: null,
      completeness: "full",
      unsupportedReason: null,
      unsupportedFields: [],
      origin: null,
      indexer: "bigname",
    });
  });

  it("pages carry the cursor and counts, or their defaults", () => {
    const empty = Convert.page({}, [], 1, "x");
    const full = Convert.page(
      { page: { next_cursor: "c2", has_more: true, total_count: 7 } },
      [1],
      1,
      "x",
    );

    assert.deepStrictEqual([empty.cursor, empty.hasMore, empty.totalCount], [null, false, null]);
    assert.deepStrictEqual([full.cursor, full.hasMore, full.totalCount], ["c2", true, 7]);
  });
});

describe("Convert names", () => {
  it("maps a recorded name detail to camelCase, bigints and checksummed addresses", () => {
    const name = Convert.detail(Fixture.nick);

    assert.strictEqual(name.owner, addresses.nick);
    assert.strictEqual(name.authority, "ensV1");
    assert.strictEqual(name.expiresAt, 2031690868n);
    assert.strictEqual(name.tokenId, BigInt(Fixture.nick.token_id ?? ""));
    assert.deepStrictEqual(name.resolver, { chainId: 1, address: addresses.publicResolver });
    assert.deepStrictEqual(name.ensV1, {
      resolver: { chainId: 1, address: addresses.publicResolver },
      expiresAt: 2031690868n,
      wrapperState: "unwrapped",
      wrapperExpiresAt: null,
      wrapperFuses: 0,
    });
  });

  it("drops cleared records but keeps their keys", () => {
    const records = Convert.detail(Fixture.nick).records;

    assert.deepStrictEqual(Object.keys(records?.texts ?? {}), ["avatar", "com.twitter"]);
    assert.deepStrictEqual(records?.addresses, { "60": addresses.nick.toLowerCase() });
    assert.deepStrictEqual(records?.textKeys, ["avatar", "com.twitter", "description"]);
    assert.deepStrictEqual(records?.coinTypes, ["60", "0"]);
  });

  it("fills defaults for a name with only its identity fields", () => {
    const name = Convert.detail(row);

    assert.strictEqual(name.displayName, "a.eth");
    assert.strictEqual(name.namespace, "ens");
    assert.deepStrictEqual(
      [name.owner, name.status, name.authority, name.expiresAt, name.ensV1, name.records],
      [null, null, null, null, null, null],
    );
  });

  it.each([
    ["no_expiry", "noExpiry"],
    ["not_set", "notSet"],
    ["released", "released"],
    ["paused", null],
  ])("maps the expiry reason %s to %s", (wire, expected) => {
    assert.strictEqual(Convert.name({ ...row, expires_at_reason: wire }).expiryReason, expected);
  });

  it("maps unknown enum values to null", () => {
    const name = Convert.name({ ...row, status: "frozen", authority: "ens_v9" });
    assert.deepStrictEqual([name.status, name.authority], [null, null]);
  });

  it("throws on a malformed address or number, which the client reports as invalid", () => {
    assert.throws(() => Convert.name({ ...row, owner: "0x1234" }));
    assert.throws(() => Convert.name({ ...row, expires_at: "soon" }));
  });

  it("camelizes relations and picks either window index", () => {
    const named = Convert.addressName({ ...row, relations: ["resolves_to", "role_holder"] });

    assert.deepStrictEqual(named.relations, ["resolvesTo", "roleHolder"]);
    assert.strictEqual(Convert.expiringName({ ...row, grace_ends_window_index: 2 }).windowIndex, 2);
  });
});

describe("Convert.event", () => {
  it("camelizes data keys recursively and reads the action from it", () => {
    const event = Convert.event({
      id: "e",
      type: "record",
      data: { action: "record_changed", record_id: "1", from_registry: { chain_id: 1 } },
    });

    assert.strictEqual(event.action, "record_changed");
    assert.deepStrictEqual(event.data, {
      action: "record_changed",
      recordId: "1",
      fromRegistry: { chainId: 1 },
    });
  });

  it("fills in the queried name when the row leaves it out", () => {
    const { name: _name, ...anonymous } = Fixture.nickEvents[0] as (typeof Fixture.nickEvents)[0];

    assert.strictEqual(Convert.event(anonymous, "nick.eth").name, "nick.eth");
    assert.strictEqual(Convert.event({ ...anonymous, name: "x.eth" }, "nick.eth").name, "x.eth");
    assert.isNull(Convert.event(anonymous).name);
  });

  it("has no action or data when data was not requested", () => {
    const event = Convert.event({ id: "e", type: "transfer", contract_address: null });
    assert.deepStrictEqual([event.action, event.data, event.contract], [null, null, null]);
  });
});

describe("Convert.records", () => {
  it("groups ok answers by kind and keeps every answer", () => {
    const records = Convert.records(Fixture.nickRecords);

    assert.deepStrictEqual(records.texts, {
      avatar: "https://metadata.ens.domains/mainnet/avatar/nick.eth",
      "com.twitter": "nicksdjohnson",
    });
    assert.deepStrictEqual(records.addresses, { "60": addresses.nick.toLowerCase() });
    assert.strictEqual(records.contentHash, Fixture.nickRecords.records.contenthash?.value);
    assert.deepStrictEqual(records.answers["text:url"], {
      status: "notFound",
      value: null,
      reason: "unset",
    });
    assert.deepStrictEqual(records.inventory?.unsupportedKeys, ["abi:1"]);
  });

  it("maps unknown statuses to failed and leaves failed values out of the groups", () => {
    const records = Convert.records({
      records: { "text:a": { status: "exploded", value: "x" } },
      inventory: null,
    });

    assert.strictEqual(records.answers["text:a"]?.status, "failed");
    assert.deepStrictEqual(records.texts, {});
    assert.isNull(records.inventory);
  });
});

const answer = (source: string, status: string, name?: string) => ({ source, status, name });
const primaryWire = (answers: ReturnType<typeof answer>[]) => ({
  address: addresses.nick.toLowerCase(),
  coin_type: 60,
  answers,
});

describe("Convert.primaryName", () => {
  it.each([
    [
      "a verified answer over an indexed one",
      [answer("indexed", "ok", "a.eth"), answer("verified", "ok", "b.eth")],
      "b.eth",
      "verified",
    ],
    [
      "the indexed answer when verification failed",
      [answer("verified", "mismatch", "b.eth"), answer("indexed", "ok", "a.eth")],
      "a.eth",
      "indexed",
    ],
    ["nothing when no answer is ok", [answer("indexed", "not_found")], null, null],
  ] as const)("chooses %s", (_, answers, name, source) => {
    const primary = Convert.primaryName(primaryWire([...answers]));
    assert.deepStrictEqual([primary.name, primary.source], [name, source]);
  });

  it("drops answers from unknown sources", () => {
    const primary = Convert.primaryName(primaryWire([answer("cache", "ok", "c.eth")]));

    assert.deepStrictEqual(primary.answers, []);
    assert.strictEqual(primary.address, addresses.nick);
  });
});

describe("Convert other resources", () => {
  it("maps a lookup result by its input", () => {
    const byAddress = Convert.lookupResult({
      input: { address: addresses.nick },
      kind: "address",
      status: "ok",
      records: [{ ...Fixture.nick, is_primary: true }],
    });
    const unknown = Convert.lookupResult({ input: {}, kind: "bogus", status: "not_found" });

    assert.deepStrictEqual([byAddress.input, byAddress.kind], [addresses.nick, "address"]);
    assert.strictEqual(byAddress.names[0]?.isPrimary, true);
    // Regression: an address's primary name comes from its rows; bigname sends no `record`.
    assert.strictEqual(byAddress.name?.name, Fixture.nick.name);
    assert.deepStrictEqual([unknown.input, unknown.kind, unknown.name], ["", "name", null]);
  });

  it("camelizes permission lineage", () => {
    const permission = Convert.permission(
      Fixture.permissionRows[0] as (typeof Fixture.permissionRows)[0],
    );

    assert.deepStrictEqual(permission.lineage, {
      grantedBy: Fixture.permissionRows[0]?.lineage?.granted_by,
      grantEvent: { blockNumber: 4_200_000 },
    });
    assert.deepStrictEqual([permission.scope, permission.relation], ["registration", "holder"]);
  });

  it("reads a resolver link without a name as the empty name", () => {
    const link = Convert.resolverLink({ namehash: "0x01", record_id: "2", default: false });
    assert.deepStrictEqual([link.name, link.blockNumber, link.transactionHash], ["", null, null]);
  });

  it("maps namespace capabilities and protocols", () => {
    const info = Convert.namespace({
      ...Fixture.ensNamespace,
      capabilities: { a: { completeness: "partial" }, b: { completeness: "new" } },
    });

    assert.deepStrictEqual(info.capabilities, { a: "partial", b: "unsupported" });
    assert.deepStrictEqual(info.networks[0], {
      network: "mainnet",
      chainId: 1,
      protocol: "ensV1",
      sinceBlock: 9_380_380n,
    });
  });

  it("keys chain status by number and degrades unknown statuses", () => {
    const status = Convert.status(
      { status: "booting", chains: { "1": { indexed_block: 5, safe_block: null } } },
      "bigname",
    );

    assert.strictEqual(status.status, "degraded");
    assert.deepStrictEqual(status.chains[1], {
      status: "degraded",
      indexed: 5n,
      latest: null,
      safe: null,
      finalized: null,
      lagBlocks: null,
      lagSeconds: null,
    });
  });

  it("checksums registry and resolver addresses", () => {
    const registry = Convert.registry(Fixture.registryOverview);

    assert.strictEqual(registry.address, addresses.registry);
    assert.strictEqual(registry.parent?.address, addresses.parentRegistry);
    assert.deepStrictEqual(registry.referencedBy, ["nick.eth"]);
  });
});
