import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { labelhash, namehash } from "viem/ens";

import { normalizeV1IndexedName } from "../../../../src/internal/indexer/normalize/v1-name.js";
import {
  normalizeV2IndexerName,
  type V2IndexedNameWire,
} from "../../../../src/internal/indexer/normalize/v2-name.js";

const registryOwner = "0x000000000000000000000000000000000000bEEF" as const;

const wrappedOwner = "0x000000000000000000000000000000000000dEaD" as const;

const resolver = "0x0000000000000000000000000000000000001234" as const;

const context = {
  network: "sepolia",
  protocol: "v2",
  indexedBlock: 12_345n,
  operationName: "TestIndexedName",
} as const;

const v1Wire = {
  id: namehash("alice.eth"),
  name: "alice.eth",
  labelName: "alice",
  labelhash: labelhash("alice"),
  parent: { id: namehash("eth") },
  owner: { id: registryOwner.toLowerCase() },
  registrant: { id: registryOwner.toLowerCase() },
  resolvedAddress: { id: wrappedOwner.toLowerCase() },
  resolver: { address: resolver.toLowerCase() },
  createdAt: "1700000000",
  expiryDate: "1900000000",
  subdomainCount: 2,
  isMigrated: false,
  ttl: "60",
  registration: {
    registrant: { id: registryOwner.toLowerCase() },
    registrationDate: "1700000000",
    expiryDate: "1800000000",
  },
  wrappedOwner: { id: wrappedOwner.toLowerCase() },
  wrappedDomain: {
    owner: { id: wrappedOwner.toLowerCase() },
    fuses: 65_536,
    expiryDate: "1800000000",
  },
} as const;

const v2Wire: V2IndexedNameWire = {
  id: "alice.eth",
  protocol: "v2",
  name: "alice.eth",
  labelName: "alice",
  labelhash: labelhash("alice"),
  parent: {
    id: "eth",
    subregistry: { address: registryOwner.toLowerCase() },
  },
  owner: { id: wrappedOwner.toLowerCase() },
  registrant: { id: wrappedOwner.toLowerCase() },
  resolvedAddress: null,
  resolver: { address: resolver.toLowerCase() },
  createdAt: 1_700_000_000,
  expiryDate: 1_900_000_000,
  subdomainCount: 3,
  isMigrated: false,
  ttl: null,
  wrappedOwner: null,
  wrappedDomain: null,
  subregistry: { address: resolver.toLowerCase() },
  canonicalId: "0x7b",
  tokenId: "0x1c8",
  tokenVersion: 2,
  registrationDate: 1_700_000_000,
  gracePeriodEnd: null,
  unreachableSince: null,
  isNormalized: true,
  isReachable: true,
  isWrapped: false,
  roleHolderCount: 1,
};

describe("indexed name normalization", () => {
  it.effect("normalizes V1 wire values and uses the wrapped owner", () =>
    Effect.gen(function* () {
      const result = yield* normalizeV1IndexedName(
        { ...v1Wire, isMigrated: true },
        {
          ...context,
          protocol: "v1",
        },
      );

      assert.strictEqual(result.protocol, "v1");
      assert.isFalse(result.isMigrated);

      if (result.protocol !== "v1") return;

      assert.strictEqual(result.name.kind, "normalized");
      assert.strictEqual(result.name.value, "alice.eth");
      assert.strictEqual(result.owner, wrappedOwner);
      assert.strictEqual(result.registryOwner, registryOwner);
      assert.strictEqual(result.createdAt, 1_700_000_000n);
      assert.strictEqual(result.registration?.expiry, 1_800_000_000n);
      assert.strictEqual(result.wrapped?.fuses, 65_536n);
    }),
  );

  it.effect("distinguishes entity protocol from the V2 indexer source", () =>
    Effect.gen(function* () {
      const result = yield* normalizeV2IndexerName({ ...v2Wire, protocol: "v1", ttl: 60 }, context);

      assert.strictEqual(result.protocol, "v1");
      assert.strictEqual(result.source.protocol, "v2");

      if (result.protocol !== "v1") return;

      assert.strictEqual(result.ttl, 60n);
      assert.isNull(result.registryOwner);
    }),
  );

  it.effect("normalizes V2 registry and token facts", () =>
    Effect.gen(function* () {
      const result = yield* normalizeV2IndexerName(v2Wire, context);

      assert.strictEqual(result.protocol, "v2");

      if (result.protocol !== "v2") return;

      assert.strictEqual(result.registry, registryOwner);
      assert.strictEqual(result.subregistry, resolver);
      assert.strictEqual(result.canonicalId, 123n);
      assert.strictEqual(result.token?.tokenId, 456n);
      assert.strictEqual(result.token?.contract, registryOwner);
      assert.isTrue(result.isReachable);
    }),
  );

  it.effect("rejects a normalized name that does not match its namehash", () =>
    Effect.gen(function* () {
      const error = yield* normalizeV2IndexerName({ ...v2Wire, id: "bob.eth" }, context).pipe(
        Effect.flip,
      );

      assert.strictEqual(error.code, "INVALID_RESPONSE");
    }),
  );

  it.effect("preserves an encoded name instead of inventing a normalized value", () =>
    Effect.gen(function* () {
      const encoded = `[${"a".repeat(64)}].eth`;

      const result = yield* normalizeV1IndexedName(
        { ...v1Wire, id: namehash(encoded), name: encoded },
        { ...context, protocol: "v1" },
      );

      assert.deepStrictEqual(result.name, { kind: "encoded", value: encoded });
    }),
  );

  it.effect("preserves a raw name whose normalized form has a different namehash", () =>
    Effect.gen(function* () {
      const rawName = "Alice.eth";

      const result = yield* normalizeV1IndexedName(
        { ...v1Wire, id: namehash(rawName), name: rawName },
        { ...context, protocol: "v1" },
      );

      assert.deepStrictEqual(result.name, { kind: "encoded", value: rawName });
    }),
  );
});
