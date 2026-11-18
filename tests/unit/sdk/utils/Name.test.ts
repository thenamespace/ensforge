import { assert, describe, it } from "@effect/vitest";
import { String as Str } from "effect";

import * as Name from "@ensforge/sdk/internal/utils/Name";
import { Arbitraries, expectThrow } from "@ensforge/test-harness";

const encoded = `[${Str.repeat(32)("ab")}]`;

describe("Name.normalize", () => {
  it.each([
    [`${encoded}.eth`, `${encoded}.eth`],
    [`A.${encoded}.B.eth`, `a.${encoded}.b.eth`],
    ["", ""],
  ])("keeps encoded labels and the root: %j", (input, expected) => {
    assert.strictEqual(Name.normalize(input), expected);
  });

  // The root is `""`; ensjs's `[root]` notation is not a name.
  it.each([
    "nick..eth",
    `[${Str.repeat(32)("AB")}].eth`,
    `[0x${Str.repeat(32)("ab")}].eth`,
    `[${Str.repeat(31)("ab")}].eth`,
    `[${Str.repeat(33)("ab")}].eth`,
    "[root]",
    "[root].eth",
  ])("rejects %j with INVALID_NAME", { meta: { cases: ["H09", "H15"] } }, (input) => {
    expectThrow(() => Name.normalize(input), { _tag: "InvalidInputError", code: "INVALID_NAME" });
    assert.isFalse(Name.isValid(input));
  });
});

describe("Name.labelhash", () => {
  it("returns the hash of an encoded label", () => {
    assert.strictEqual(Name.labelhash(encoded), `0x${Str.repeat(32)("ab")}`);
  });

  it.each(["", "a.b"])("rejects %j", (label) => {
    expectThrow(() => Name.labelhash(label), { _tag: "InvalidInputError", code: "INVALID_NAME" });
  });
});

describe("Name DNS encoding", () => {
  it.prop("dnsDecode inverts dnsEncode", [Arbitraries.name], ([name]) => {
    assert.strictEqual(Name.dnsDecode(Name.dnsEncode(name)), name);
  });

  it.each(["0x", "0x03616263", "0x036162630000", "0x0500", "0x03612e6200"] as const)(
    "dnsDecode rejects malformed %s",
    { meta: { cases: ["H07"] } },
    (data) => {
      expectThrow(() => Name.dnsDecode(data), { _tag: "InvalidInputError", code: "INVALID_NAME" });
    },
  );

  // 0xC0 and up would be a compression pointer in DNS messages; names never compress.
  it("dnsDecode reads every length byte as a length", { meta: { cases: ["H08"] } }, () => {
    for (const length of [1, 63, 64, 192, 255]) {
      const label = Str.repeat(length)("a");
      const data =
        `0x${Str.padStart(2, "0")(length.toString(16))}${Str.repeat(length)("61")}00` as const;
      assert.strictEqual(Name.dnsDecode(data), label);
    }
  });
});

describe("Name.parse", () => {
  it.each([
    ["", { labels: [], label: "", tld: "", parent: null, is2ld: false, isSubname: false }],
    [
      "eth",
      { labels: ["eth"], label: "eth", tld: "eth", parent: null, is2ld: false, isSubname: false },
    ],
    [
      "Nick.eth",
      {
        labels: ["nick", "eth"],
        label: "nick",
        tld: "eth",
        parent: "eth",
        is2ld: true,
        isSubname: false,
      },
    ],
    [
      "pay.nick.eth",
      {
        labels: ["pay", "nick", "eth"],
        label: "pay",
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
    assert.strictEqual(Name.fromLabelhash(`0x${Str.repeat(32)("AB")}`), encoded);
  });
});
