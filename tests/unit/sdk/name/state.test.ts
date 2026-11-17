import { assert, describe, it } from "@effect/vitest";

import { classify } from "@ensforge/sdk/internal/internal/name/classify";
import { nameParts } from "@ensforge/sdk/internal/internal/name/parts";
import {
  RegistryStatus,
  type NameData,
  type V2Data,
} from "@ensforge/sdk/internal/internal/name/read";
import { toNameState } from "@ensforge/sdk/internal/internal/name/state";
import { zeroAddress, type Address } from "viem";

const now = 1_800_000_000n;
const day = 86_400n;
const alice: Address = "0x00000000000000000000000000000000000a11ce";
const registry: Address = "0x00000000000000000000000000000000000000e7";
const nameWrapper: Address = "0x00000000000000000000000000000000000000ff";

const v2Entry = (state: Partial<V2Data["state"]>): V2Data => ({
  registry,
  state: {
    status: RegistryStatus.available,
    expiry: 0n,
    latestOwner: zeroAddress,
    tokenId: 1n,
    resource: 1n,
    ...state,
  },
  resolver: undefined,
  subregistry: undefined,
  gracePeriod: 28n * day,
});

// A live, unwrapped ENSv1 `.eth` name, with or without an ENSv2 entry for its label.
const v1Name = (v2: V2Data | undefined, expiry = now + 365n * day): NameData => ({
  parts: nameParts("alice.eth"),
  now,
  v1: {
    registry,
    registryOwner: alice,
    resolver: zeroAddress,
    ttl: 0n,
    wrapper: { owner: zeroAddress, fuses: 0, expiry: 0n },
    registrar: { registrant: alice, expiry, gracePeriod: 90n * day },
  },
  v2,
  ownedAncestor: false,
});

const stateOf = (data: NameData, v1Registers: boolean) =>
  toNameState(data, classify(data, { nameWrapper }), { v1Registers });

describe("name state", () => {
  it("reports no owner for an ENSv2 name in grace or expired", () => {
    for (const expiry of [now - day, now - 60n * day]) {
      const data: NameData = {
        ...v1Name(undefined),
        v1: undefined,
        v2: v2Entry({ expiry, latestOwner: alice }),
      };
      const state = stateOf(data, false);
      assert.strictEqual(state.owner, null, state.status);
    }
  });

  it("after the launch, an unreserved ENSv1 name is registrable on ENSv2 and not renewable", () => {
    const state = stateOf(v1Name(v2Entry({})), false);
    assert.include(state, {
      kind: "v1-unwrapped",
      status: "registered",
      available: true,
      renewable: false,
    });
  });

  it("after the launch, a reserved ENSv1 name renews through its reservation", () => {
    const state = stateOf(
      v1Name(v2Entry({ status: RegistryStatus.reserved, expiry: now + 400n * day })),
      false,
    );
    assert.include(state, { available: false, renewable: true });
  });

  it("before the launch, ENSv1 still renews its own names", () => {
    const state = stateOf(v1Name(undefined), true);
    assert.include(state, { available: false, renewable: true });
  });

  it("after the launch, an expired ENSv1 subname is still available from its parent", () => {
    const data: NameData = {
      ...v1Name(undefined),
      parts: nameParts("sub.alice.eth"),
      v1: {
        registry,
        registryOwner: nameWrapper,
        resolver: zeroAddress,
        ttl: 0n,
        wrapper: { owner: alice, fuses: 0, expiry: now - day },
        registrar: undefined,
      },
    };
    const state = stateOf(data, false);
    assert.include(state, { status: "expired", available: true, renewable: false });
  });

  it("follows ENSv1's inclusive window ends", () => {
    const expiry = now + day;
    const grace = 90n * day;
    const statusAt = (time: bigint) =>
      stateOf({ ...v1Name(undefined, expiry), now: time }, true).status;
    assert.deepStrictEqual(
      [expiry - 1n, expiry, expiry + grace, expiry + grace + 1n].map(statusAt),
      ["registered", "grace", "grace", "expired"],
    );
  });

  it("keeps a wrapped subname live through its wrapper expiry", () => {
    const data: NameData = {
      ...v1Name(undefined),
      parts: nameParts("sub.alice.eth"),
      v1: {
        registry,
        registryOwner: nameWrapper,
        resolver: zeroAddress,
        ttl: 0n,
        wrapper: { owner: alice, fuses: 0, expiry: now },
        registrar: undefined,
      },
    };
    assert.include(stateOf(data, true), { status: "registered", owner: alice });
  });
});
