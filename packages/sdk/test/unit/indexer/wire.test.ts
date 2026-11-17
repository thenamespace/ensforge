import { assert, describe, it } from "@effect/vitest";
import { Effect, type Schema } from "effect";

import { expectFailure } from "@ensforge/test-harness";
import * as Fixture from "@ensforge/test-harness/indexer/fixtures/bigname";

import * as Wire from "#/internal/indexer/wire";

const source = { id: "bigname", route: "/names/{name}" };

describe("Wire schemas", () => {
  // Recorded answers carry fields ensforge does not read (canonical_name, abis, created_basis…).
  it.effect.each([
    ["NameRecord", Wire.NameRecord, Fixture.nick],
    ["Subname", Wire.Subname, Fixture.subnames[0]],
    ["HistoryEvent", Wire.HistoryEvent, Fixture.nickEvents[0]],
    ["NameRecords", Wire.NameRecords, Fixture.nickRecords],
    ["PermissionRow", Wire.PermissionRow, Fixture.permissionRows[0]],
    ["RegistryOverview", Wire.RegistryOverview, Fixture.registryOverview],
    ["Namespace", Wire.Namespace, Fixture.ensNamespace],
    ["StatusData", Wire.StatusData, Fixture.status],
  ] as const)("decode a recorded %s", ([, schema, data]) =>
    Effect.gen(function* () {
      const envelope = yield* Wire.decode(
        Wire.envelope(schema as Schema.Codec<unknown, unknown, never, never>),
        {
          data,
          meta: Fixture.meta,
        },
        source,
      );
      assert.isDefined(envelope.data);
    }),
  );

  it.effect("decode a name with only its identity fields, and nulls for the rest", () =>
    Effect.gen(function* () {
      const envelope = yield* Wire.decode(
        Wire.envelope(Wire.NameRecord),
        { data: { name: "a.eth", namehash: "0x01", owner: null, ens_v1: null }, meta: null },
        source,
      );

      assert.strictEqual(envelope.data.name, "a.eth");
      assert.isNull(envelope.data.owner);
      assert.isNull(envelope.meta);
    }),
  );

  it.effect("keep unknown enum values as strings", () =>
    Effect.gen(function* () {
      const envelope = yield* Wire.decode(
        Wire.envelope(Wire.SearchName),
        { data: { name: "a.eth", namehash: "0x01", status: "frozen", authority: "ens_v9" } },
        source,
      );
      assert.strictEqual(envelope.data.status, "frozen");
    }),
  );

  it.effect.each([
    ["a missing identity field", { data: { name: "a.eth" } }],
    ["a wrongly typed field", { data: { name: "a.eth", namehash: "0x01", record_count: "3" } }],
    ["a missing envelope", { name: "a.eth", namehash: "0x01" }],
    ["no body", undefined],
  ])("fail on %s with INDEXER_RESPONSE_INVALID", ([, body]) =>
    Effect.gen(function* () {
      const error = yield* expectFailure(
        Wire.decode(Wire.envelope(Wire.NameRecord), body, source),
        {
          _tag: "IndexerError",
          code: "INDEXER_RESPONSE_INVALID",
        },
      );
      assert.strictEqual(error.route, "/names/{name}");
      assert.strictEqual(error.source, "bigname");
      assert.lengthOf(error.details ?? [], 1);
    }),
  );
});
