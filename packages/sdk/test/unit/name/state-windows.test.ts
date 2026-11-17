import { assert, describe, it } from "@effect/vitest";

import { maxUint64, zeroAddress, type Address } from "viem";

import { classify, isMigrated } from "#/internal/name/classify";
import { nameParts } from "#/internal/name/parts";
import { RegistryStatus, type NameData, type V1Data, type V2Data } from "#/internal/name/read";
import { toNameState } from "#/internal/name/state";

const now = 1_800_000_000n;
const day = 86_400n;
const alice: Address = "0x00000000000000000000000000000000000a11ce";
const registry: Address = "0x00000000000000000000000000000000000000e7";
const nameWrapper: Address = "0x00000000000000000000000000000000000000ff";
const graveyard: Address = "0x0000000000000000000000000000000000000dea";
const v2Grace = 28n * day;
const v1Grace = 90n * day;

const v2 = (
  state: Partial<V2Data["state"]>,
  options: { readonly grace?: boolean } = {},
): V2Data => ({
  registry,
  state: {
    status: RegistryStatus.registered,
    expiry: now + day,
    latestOwner: alice,
    tokenId: 1n,
    resource: 1n,
    ...state,
  },
  resolver: undefined,
  subregistry: undefined,
  gracePeriod: options.grace === false ? undefined : v2Grace,
});

const v1 = (overrides: Partial<V1Data> = {}): V1Data => ({
  registry,
  registryOwner: alice,
  resolver: zeroAddress,
  ttl: 0n,
  wrapper: { owner: zeroAddress, fuses: 0, expiry: 0n },
  registrar: { registrant: alice, expiry: now + day, gracePeriod: v1Grace },
  ...overrides,
});

const data = (overrides: Partial<NameData>, name = "alice.eth"): NameData => ({
  parts: nameParts(name),
  now,
  v1: undefined,
  v2: undefined,
  ownedAncestor: false,
  ...overrides,
});

const stateOf = (input: NameData, v1Registers = false) =>
  toNameState(input, classify(input, { nameWrapper, graveyard }), { v1Registers });

describe("ENSv2 name state", () => {
  const expiry = now + day;
  const at = (time: bigint) => stateOf(data({ now: time, v2: v2({ expiry }) }));

  it("is registered until expiry, in grace until its end, then expired", () => {
    assert.deepStrictEqual(
      [expiry - 1n, expiry, expiry + v2Grace - 1n, expiry + v2Grace].map((time) => at(time).status),
      ["registered", "grace", "grace", "expired"],
    );
  });

  it("is held, renewable and not registrable only while registered or in grace", () => {
    assert.include(at(expiry - 1n), {
      owner: alice,
      available: false,
      renewable: true,
      wrapped: false,
      migrated: false,
    });
    assert.include(at(expiry), { owner: null, available: false, renewable: true });
    assert.include(at(expiry + v2Grace), { owner: null, available: true, renewable: false });
  });

  it("reports the expiry and the end of grace", () => {
    assert.include(at(now), { expiry, gracePeriodEnd: expiry + v2Grace, protocol: "v2" });
  });

  it("has no expiry or grace when it never expires, or no grace outside .eth", () => {
    assert.include(stateOf(data({ v2: v2({ expiry: maxUint64 }) })), {
      status: "registered",
      expiry: null,
      gracePeriodEnd: null,
    });
    const sub = stateOf(data({ v2: v2({ expiry }, { grace: false }) }, "sub.alice.eth"));
    assert.include(sub, { gracePeriodEnd: null, renewable: false });
    assert.strictEqual(
      stateOf(data({ now: expiry, v2: v2({ expiry }, { grace: false }) })).status,
      "expired",
    );
  });

  it("is reserved, neither registrable nor renewable, without an ENSv1 owner", () => {
    const reserved = stateOf(
      data({ v2: v2({ status: RegistryStatus.reserved, latestOwner: zeroAddress }) }),
    );
    assert.include(reserved, {
      kind: "v2-reserved",
      status: "reserved",
      available: false,
      renewable: false,
    });
  });

  it("is migrated when its ENSv1 records went to the Graveyard", () => {
    const migrated = stateOf(data({ v1: v1({ registryOwner: graveyard }), v2: v2({}) }));
    assert.include(migrated, { kind: "v2-migrated", migrated: true, protocol: "v2" });
    assert.include(stateOf(data({ v2: v2({}) })), { kind: "v2-native", migrated: false });
  });
});

/** An unwrapped ENSv1 subname held by `owner`, before the launch. */
const unwrappedSub = (owner: Address) =>
  stateOf(data({ v1: v1({ registryOwner: owner, registrar: undefined }) }, "sub.alice.eth"), true);

describe("ENSv1 name state", () => {
  it("reports the registrant, manager, expiry and end of grace of an unwrapped .eth name", () => {
    const expiry = now + day;
    assert.include(stateOf(data({ v1: v1() })), {
      kind: "v1-unwrapped",
      protocol: "v1",
      owner: alice,
      manager: alice,
      registrant: alice,
      expiry,
      gracePeriodEnd: expiry + v1Grace,
      wrapped: false,
      migrated: false,
    });
  });

  it("reports the wrapper owner and expiry of a wrapped name, without a manager", () => {
    const wrapped = v1({
      registryOwner: nameWrapper,
      wrapper: { owner: alice, fuses: 0, expiry: now + 2n * day },
      registrar: undefined,
    });
    assert.include(stateOf(data({ v1: wrapped }, "sub.alice.eth")), {
      kind: "v1-wrapped",
      owner: alice,
      manager: null,
      registrant: null,
      wrapped: true,
      expiry: now + 2n * day,
      gracePeriodEnd: null,
      renewable: false,
    });
  });

  it("never expires as an unwrapped subname, and is available once nobody owns it", () => {
    assert.include(unwrappedSub(alice), {
      status: "registered",
      owner: alice,
      expiry: null,
      gracePeriodEnd: null,
      available: false,
      renewable: false,
    });
    assert.include(unwrappedSub(zeroAddress), {
      kind: "available",
      status: "available",
      available: true,
    });
  });

  it("is available, with no owner, when neither protocol has a record", () => {
    assert.include(stateOf(data({})), {
      kind: "available",
      status: "available",
      owner: null,
      manager: null,
      registrant: null,
      expiry: null,
      wrapped: false,
      migrated: false,
      available: true,
      renewable: false,
    });
  });
});

describe("isMigrated", () => {
  it("recognises records held by the Graveyard, directly or through a NameWrapper token", () => {
    assert.isTrue(isMigrated(v1({ registryOwner: graveyard }), graveyard, nameWrapper));
    assert.isTrue(
      isMigrated(
        v1({ registryOwner: nameWrapper, wrapper: { owner: graveyard, fuses: 0, expiry: 0n } }),
        graveyard,
        nameWrapper,
      ),
    );
    assert.isFalse(
      isMigrated(
        v1({ registryOwner: nameWrapper, wrapper: { owner: alice, fuses: 0, expiry: 0n } }),
        graveyard,
        nameWrapper,
      ),
    );
    assert.isFalse(isMigrated(v1(), graveyard, nameWrapper));
    assert.isFalse(isMigrated(v1({ registryOwner: graveyard }), undefined, nameWrapper));
    assert.isFalse(isMigrated(undefined, graveyard, nameWrapper));
  });
});
