import { assert, describe, it } from "@effect/vitest";

import { Arbitraries, expectThrow } from "@ensforge/test-harness";
import { labelhash as viemLabelhash, namehash as viemNamehash } from "viem/ens";

import * as Name from "#/utils/Name";

const invalidName = { _tag: "InvalidInputError", code: "INVALID_NAME" };
const encoded = `[${"ab".repeat(32)}]`;

describe("Name.normalize", () => {
  it.each([
    ["Nick.ETH", "nick.eth"],
    ["", ""],
    ["ＮＩＣＫ.eth", "nick.eth"],
    [`${encoded}.eth`, `${encoded}.eth`],
    [`A.${encoded}.B.eth`, `a.${encoded}.b.eth`],
  ])("normalizes %j to %j", (input, expected) => {
    assert.strictEqual(Name.normalize(input), expected);
  });

  it.each(["nick..eth", "nick.eth.", ".eth", "nick。eth", "a_‍.eth", `[${"AB".repeat(32)}].eth`])(
    "rejects %j with INVALID_NAME",
    (input) => {
      expectThrow(() => Name.normalize(input), invalidName);
      assert.isFalse(Name.isValid(input));
    },
  );

  it.prop("is idempotent", [Arbitraries.unicodeLabel], ([label]) => {
    const once = Name.normalize(`${label}.eth`);
    assert.strictEqual(Name.normalize(once), once);
  });
});

describe("Name hashing", () => {
  it.prop("namehash equals viem's on normalized names", [Arbitraries.name], ([name]) => {
    assert.strictEqual(Name.namehash(name), viemNamehash(name));
  });

  it.prop("labelhash equals viem's", [Arbitraries.asciiLabel], ([label]) => {
    assert.strictEqual(Name.labelhash(label), viemLabelhash(label));
  });

  it("namehash normalizes first", () => {
    assert.strictEqual(Name.namehash("Nick.ETH"), viemNamehash("nick.eth"));
  });

  it("labelhash of an encoded label is its hash", () => {
    assert.strictEqual(Name.labelhash(encoded), `0x${"ab".repeat(32)}`);
  });

  it.each(["", "a.b"])("labelhash rejects %j", (label) => {
    expectThrow(() => Name.labelhash(label), invalidName);
  });

  it("toTokenId is the labelhash of the first label", () => {
    assert.strictEqual(Name.toTokenId("Nick.eth"), BigInt(viemLabelhash("nick")));
  });
});

describe("Name DNS encoding", () => {
  it.prop("dnsDecode inverts dnsEncode", [Arbitraries.name], ([name]) => {
    assert.strictEqual(Name.dnsDecode(Name.dnsEncode(name)), name);
  });

  it("encodes the root as a single zero byte", () => {
    assert.strictEqual(Name.dnsEncode(""), "0x00");
    assert.strictEqual(Name.dnsDecode("0x00"), "");
  });

  it.each(["0x", "0x03616263", "0x036162630000", "0x0500"] as const)(
    "dnsDecode rejects %s",
    (data) => {
      expectThrow(() => Name.dnsDecode(data), invalidName);
    },
  );
});

describe("Name.parse", () => {
  it.each([
    ["", { labels: [], tld: "", parent: null, is2ld: false, isSubname: false }],
    ["eth", { labels: ["eth"], tld: "eth", parent: null, is2ld: false, isSubname: false }],
    [
      "Nick.eth",
      { labels: ["nick", "eth"], tld: "eth", parent: "eth", is2ld: true, isSubname: false },
    ],
    [
      "pay.nick.eth",
      {
        labels: ["pay", "nick", "eth"],
        tld: "eth",
        parent: "nick.eth",
        is2ld: false,
        isSubname: true,
      },
    ],
  ] as const)("parses %j", (input, expected) => {
    assert.deepStrictEqual(Name.parse(input), expected);
    assert.strictEqual(Name.getParent(input), expected.parent);
  });

  it("fromLabelhash lowercases the hash", () => {
    assert.strictEqual(Name.fromLabelhash(`0x${"AB".repeat(32)}`), encoded);
  });
});
