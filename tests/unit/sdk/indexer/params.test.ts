import { assert, describe, it } from "@effect/vitest";

import * as Params from "@ensforge/sdk/internal/internal/indexer/params";
import * as Fixture from "@ensforge/test-harness/indexer/fixtures/bigname";

const { nick, registry } = Fixture.addresses;
const at2024 = new Date("2024-01-01T00:00:00.900Z");

describe("Params", () => {
  it.each([
    ["a token", { at: { token: "snap_1" } }, { at: "snap_1", finality: undefined }],
    ["seconds", { at: { timestamp: 1_700_000_000n } }, { at: "1700000000", finality: undefined }],
    [
      "a date, floored to seconds",
      { at: { timestamp: at2024 }, finality: "safe" as const },
      { at: "1704067200", finality: "safe" },
    ],
  ])("snapshot encodes %s", (_, query, expected) => {
    assert.deepStrictEqual(Params.snapshot(query), expected);
  });

  it("addressNames snake-cases lists, keeps `any`, and maps sort keys", () => {
    const params = Params.addressNames({
      address: nick,
      relation: ["roleHolder", "formerOwner"],
      authority: "ensV2",
      coinType: 2147483658n,
      sort: "expiry",
      expiresBefore: 1_800_000_000n,
      includeTotal: true,
      limit: 20,
    });

    assert.deepStrictEqual(params.relation, ["role_holder", "former_owner"]);
    assert.deepStrictEqual(params.authority, ["ens_v2"]);
    assert.strictEqual(params.coin_type, "2147483658");
    assert.strictEqual(params.sort, "expires_at");
    assert.strictEqual(params.expires_before, "1800000000");
    assert.deepStrictEqual(params.include, ["total_count"]);
    assert.strictEqual(params.page_size, 20);
    assert.strictEqual(Params.addressNames({ address: nick, relation: "any" }).relation, "any");
    assert.isUndefined(Params.addressNames({ address: nick }).include);
  });

  it("history includes data unless turned off, and child registrations only for names", () => {
    const byName = Params.history({
      name: "nick.eth",
      namespace: "ens",
      includeChildRegistrations: true,
      includeTotal: true,
    });
    const byAddress = Params.history({
      address: nick,
      relation: ["roleHolder"],
      includeData: false,
      from: at2024,
    });

    assert.deepStrictEqual(byName.include, ["data", "total_count", "child_registrations"]);
    assert.isUndefined(byName.relation);
    assert.isUndefined(byAddress.include);
    assert.deepStrictEqual(byAddress.relation, ["role_holder"]);
    assert.strictEqual(byAddress.from_timestamp, "1704067200");
  });

  it("events encodes contracts as chain:address", () => {
    const params = Params.events({
      name: "nick.eth",
      resolver: { chainId: 1, address: registry },
      fromBlock: 26_000_000n,
      types: ["record", "primary_name"],
    });

    assert.strictEqual(params.resolver, `1:${registry}`);
    assert.strictEqual(params.from_block, 26_000_000n);
    assert.deepStrictEqual(params.type, ["record", "primary_name"]);
    assert.deepStrictEqual(params.include, ["data"]);
  });

  it("expiry encodes half-open windows and grace sort", () => {
    const params = Params.expiry({
      namespace: "ens",
      windows: [{ after: 1n, before: at2024 }],
      graceWindows: [{ after: 5n, before: 6n }],
      sort: "graceEnd",
    });

    assert.deepStrictEqual(params.expires_window, ["1..1704067200"]);
    assert.deepStrictEqual(params.grace_ends_window, ["5..6"]);
    assert.strictEqual(params.sort, "grace_ends_at");
  });

  it.each([
    ["avatar", "text:avatar"],
    ["text:url", "text:url"],
    ["addr:60", "addr:60"],
    ["contenthash", "contenthash"],
  ])("recordKey(%s) is %s", (key, expected) => {
    assert.strictEqual(Params.recordKey(key), expected);
  });

  it("records asks for the inventory, except on a resolver read, which passes the name", () => {
    const current = Params.records({ name: "nick.eth", namespace: "ens", keys: ["avatar"] });
    const onResolver = Params.records({
      name: "nick.eth",
      namespace: "ens",
      resolver: { chainId: 1, address: registry },
    });

    assert.deepStrictEqual(current.keys, ["text:avatar"]);
    assert.deepStrictEqual(current.include, ["inventory"]);
    assert.isUndefined(current.name);
    assert.isUndefined(onResolver.include);
    assert.strictEqual(onResolver.name, "nick.eth");
  });

  it("permissions encodes the registry and lineage", () => {
    const params = Params.permissions({
      registry: { chainId: 1, address: registry },
      includeLineage: true,
    });
    assert.deepStrictEqual([params.registry, params.include], [`1:${registry}`, ["lineage"]]);
  });

  it("lookup splits addresses from names and omits unset options", () => {
    assert.deepStrictEqual(Params.lookup({ inputs: ["nick.eth", nick] }), {
      inputs: [{ name: "nick.eth" }, { address: nick }],
    });
    assert.deepStrictEqual(
      Params.lookup({ inputs: ["a.eth"], namespace: "basenames", profile: "detail" }),
      { inputs: [{ name: "a.eth" }], namespace: "basenames", profile: "detail" },
    );
  });
});
