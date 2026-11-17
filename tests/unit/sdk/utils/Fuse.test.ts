import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import * as Fuse from "@ensforge/sdk/internal/utils/Fuse";
import { expectThrow } from "@ensforge/test-harness";

// INameWrapper constants from @ensdomains/ens-contracts.
const values = {
  cannotUnwrap: 1,
  cannotBurnFuses: 2,
  cannotTransfer: 4,
  cannotSetResolver: 8,
  cannotSetTtl: 16,
  cannotCreateSubdomain: 32,
  cannotApprove: 64,
  parentCannotControl: 0x10000,
  isDotEth: 0x20000,
  canExtendExpiry: 0x40000,
} as const;

const names = Object.keys(values) as Fuse.Name[];
const noneBurned = Object.fromEntries(names.map((name) => [name, false])) as Fuse.Decoded;

describe("Fuse.from", () => {
  it.each(Object.entries(values) as [Fuse.Name, number][])("%s is %i", (name, value) => {
    assert.strictEqual(Fuse.from([name]), value);
  });

  it.each([
    [[], 0],
    [["cannotUnwrap", "cannotTransfer"], 5],
    [["cannotUnwrap", "cannotUnwrap"], 1],
    [["parentCannotControl", "cannotUnwrap", "cannotSetResolver"], 0x10009],
    [names, 0x7007f],
  ] as const)("burns %j as %i", (burned, mask) => {
    assert.strictEqual(Fuse.from(burned), mask);
  });

  it.each(["canDoEverything", "parentControlled", "userSettable", "nope"])("rejects %j", (name) => {
    expectThrow(() => Fuse.from([name as Fuse.Name]), {
      _tag: "InvalidInputError",
      code: "INVALID_RECORD_VALUE",
    });
  });
});

describe("Fuse.has and Fuse.decode", () => {
  it("decodes an empty mask as nothing burned", () => {
    assert.deepStrictEqual(Fuse.decode(0), noneBurned);
  });

  it("decodes the parent-controlled range", () => {
    assert.deepStrictEqual(Fuse.decode(0xffff0000), {
      ...noneBurned,
      parentCannotControl: true,
      isDotEth: true,
      canExtendExpiry: true,
    });
  });

  it("checks each fuse independently", () => {
    assert.isTrue(Fuse.has(0x10001, "cannotUnwrap"));
    assert.isTrue(Fuse.has(0x10001, "parentCannotControl"));
    assert.isFalse(Fuse.has(0x10001, "cannotBurnFuses"));
    assert.isFalse(Fuse.has(0, "cannotUnwrap"));
  });

  it.prop(
    "decode inverts from",
    [Schema.Array(Schema.Literals(names as [Fuse.Name, ...Fuse.Name[]]))],
    ([burned]) => {
      const decoded = Fuse.decode(Fuse.from(burned));
      for (const name of names) assert.strictEqual(decoded[name], burned.includes(name));
    },
  );
});
