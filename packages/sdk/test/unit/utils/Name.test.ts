import { assert, describe, it } from "@effect/vitest";

import { Arbitraries, expectThrow } from "@ensforge/test-harness";

import * as Name from "#/utils/Name";

const invalidName = { _tag: "InvalidInputError", code: "INVALID_NAME" };
const hash = `0x${"ab".repeat(32)}` as const;
const encoded = `[${"ab".repeat(32)}]`;

describe("Name.normalize", () => {
  it.each([
    [`${encoded}.eth`, `${encoded}.eth`],
    [`A.${encoded}.B.eth`, `a.${encoded}.b.eth`],
    ["", ""],
  ])("keeps encoded labels and the root: %j", (input, expected) => {
    assert.strictEqual(Name.normalize(input), expected);
  });

  it.each(["nick..eth", `[${"AB".repeat(32)}].eth`, `[${"ab".repeat(31)}].eth`])(
    "rejects %j with INVALID_NAME",
    (input) => {
      expectThrow(() => Name.normalize(input), invalidName);
      assert.isFalse(Name.isValid(input));
    },
  );
});

describe("Name.labelhash", () => {
  it("returns the hash of an encoded label", () => {
    assert.strictEqual(Name.labelhash(encoded), hash);
  });

  it.each(["", "a.b"])("rejects %j", (label) => {
    expectThrow(() => Name.labelhash(label), invalidName);
  });
});

describe("Name DNS encoding", () => {
  it.prop("dnsDecode inverts dnsEncode", [Arbitraries.name], ([name]) => {
    assert.strictEqual(Name.dnsDecode(Name.dnsEncode(name)), name);
  });

  it.each(["0x", "0x03616263", "0x036162630000", "0x0500"] as const)(
    "dnsDecode rejects malformed %s",
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
  });

  it("fromLabelhash produces a lowercase encoded label", () => {
    assert.strictEqual(Name.fromLabelhash(`0x${"AB".repeat(32)}`), encoded);
  });
});
