import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { IndexedName, type NameFilter } from "../../../../src/actions/indexer/models/index.js";
import {
  compileV1NameFilter,
  compileV2NameFilter,
  matchesNameFilter,
} from "../../../../src/internal/indexer/query/name-filter.js";
import { compareIndexedNames } from "../../../../src/internal/indexer/query/name-order.js";

const owner = "0x000000000000000000000000000000000000bEEF" as const;

const indexedName = Schema.decodeUnknownSync(IndexedName)({
  protocol: "v1",
  namehash: `0x${"1".repeat(64)}`,
  name: { kind: "normalized", value: "alice.eth" },
  label: "alice",
  labelhash: `0x${"2".repeat(64)}`,
  parentNamehash: `0x${"3".repeat(64)}`,
  owner,
  resolver: null,
  resolvedAddress: null,
  createdAt: 20n,
  expiry: null,
  subnameCount: 0,
  isMigrated: false,
  source: { network: "sepolia", protocol: "v1", indexedBlock: 100n },
  registryOwner: owner,
  registrant: owner,
  ttl: 0n,
  registration: null,
  wrapped: null,
});

describe("indexed name queries", () => {
  it("compiles protocol-specific GraphQL filters", () => {
    const filter: NameFilter = {
      name: "ALICE.eth",
      search: { field: "label", mode: "starts-with", value: "ali" },
      owner,
      resolver: owner,
      expiryAfter: 1_800_000_000n,
      protocol: "v1",
      includeUnreachable: true,
    };

    assert.deepStrictEqual(compileV1NameFilter(filter), {
      excludesSource: false,
      requiresPostFilter: false,
      where: {
        name: "alice.eth",
        labelName_starts_with_nocase: "ali",
        or: [{ owner: owner.toLowerCase() }, { wrappedOwner: owner.toLowerCase() }],
        resolver_: { address: owner.toLowerCase() },
        and: [{ or: [{ expiryDate: null }, { expiryDate_gt: "1800000000" }] }],
      },
    });
    assert.deepStrictEqual(compileV2NameFilter(filter), {
      excludesSource: false,
      requiresPostFilter: true,
      where: {
        name: "alice.eth",
        labelName_starts_with_nocase: "ali",
        owner: owner.toLowerCase(),
        resolver: owner.toLowerCase(),
        includeUnreachable: true,
      },
    });
  });

  it("rejects filters outside the V2 GraphQL Int range", () => {
    assert.throws(() => compileV2NameFilter({ expiryAfter: 2_147_483_648n }), "GraphQL Int range");
  });

  it("only uses the V2 migration flag for migration filters", () => {
    assert.deepStrictEqual(compileV1NameFilter({}).where, {});
    assert.deepStrictEqual(compileV1NameFilter({ migrated: false }).where, {});
    assert.isTrue(compileV1NameFilter({ migrated: true }).excludesSource);
    assert.deepStrictEqual(compileV2NameFilter({ migrated: true }).where, { isMigrated: true });
    assert.deepStrictEqual(compileV2NameFilter({ migrated: false }).where, { isMigrated: false });
  });

  it("includes missing expiry only when no upper expiry bound is requested", () => {
    assert.isTrue(matchesNameFilter(indexedName, { expiryAfter: 100n }));
    assert.isFalse(matchesNameFilter(indexedName, { expiryBefore: 200n }));
    assert.isFalse(matchesNameFilter(indexedName, { expiryAfter: 100n, expiryBefore: 200n }));

    for (const expiry of [99n, 100n, 101n, 199n, 200n]) {
      assert.strictEqual(
        matchesNameFilter({ ...indexedName, expiry }, { expiryAfter: 100n, expiryBefore: 200n }),
        expiry > 100n && expiry < 200n,
      );
    }

    const compiled = compileV2NameFilter({ expiryAfter: 100n });
    assert.deepStrictEqual(compiled.where, {});
    assert.isTrue(compiled.requiresPostFilter);
  });

  it("applies post-filters without treating unknown values as matches", () => {
    assert.isTrue(
      matchesNameFilter(indexedName, {
        protocol: "v1",
        search: { field: "name", mode: "ends-with", value: ".ETH" },
      }),
    );
    assert.isFalse(
      matchesNameFilter(
        { ...indexedName, name: { kind: "unknown", value: null } },
        {
          name: "alice.eth",
        },
      ),
    );
  });

  it("uses namehash as the deterministic ordering tie-breaker", () => {
    const laterHash = Schema.decodeUnknownSync(IndexedName)({
      ...indexedName,
      namehash: `0x${"f".repeat(64)}` as const,
    });

    const compare = compareIndexedNames({ field: "createdAt", direction: "asc" });

    assert.isBelow(compare(indexedName, laterHash), 0);
    assert.isAbove(compare(laterHash, indexedName), 0);
  });

  it("keeps missing order values last in either direction", () => {
    const expiring = Schema.decodeUnknownSync(IndexedName)({
      ...indexedName,
      expiry: 100n,
    });

    assert.isAbove(
      compareIndexedNames({ field: "expiry", direction: "asc" })(indexedName, expiring),
      0,
    );
    assert.isAbove(
      compareIndexedNames({ field: "expiry", direction: "desc" })(indexedName, expiring),
      0,
    );
  });
});
