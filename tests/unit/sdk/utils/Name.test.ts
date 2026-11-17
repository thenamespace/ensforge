import { assert, describe, it } from "@effect/vitest";

import * as Name from "@ensforge/sdk/internal/utils/Name";
import { Arbitraries, expectThrow } from "@ensforge/test-harness";

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
      expectThrow(() => Name.normalize(input), { _tag: "InvalidInputError", code: "INVALID_NAME" });
      assert.isFalse(Name.isValid(input));
    },
  );
});

describe("Name.labelhash", () => {
  it("returns the hash of an encoded label", () => {
    assert.strictEqual(Name.labelhash(encoded), `0x${"ab".repeat(32)}`);
  });

  it.each(["", "a.b"])("rejects %j", (label) => {
    expectThrow(() => Name.labelhash(label), { _tag: "InvalidInputError", code: "INVALID_NAME" });
  });
});

describe("Name DNS encoding", () => {
  it.prop("dnsDecode inverts dnsEncode", [Arbitraries.name], ([name]) => {
    assert.strictEqual(Name.dnsDecode(Name.dnsEncode(name)), name);
  });

  it.each(["0x", "0x03616263", "0x036162630000", "0x0500"] as const)(
    "dnsDecode rejects malformed %s",
    (data) => {
      expectThrow(() => Name.dnsDecode(data), { _tag: "InvalidInputError", code: "INVALID_NAME" });
    },
  );
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
    assert.strictEqual(Name.fromLabelhash(`0x${"AB".repeat(32)}`), encoded);
  });
});
