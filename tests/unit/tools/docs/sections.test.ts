import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { sectionsOf, tagValues, throwsOf } from "@ensforge/tools/internal/docs/sections";

describe("sectionsOf", () => {
  it("splits an action's doc along the linted section grammar", () => {
    const doc = sectionsOf(
      Arr.join(
        [
          "Reads one text record.",
          "",
          "**When to use**",
          "",
          "Use to show a profile field.",
          "",
          "**Details**",
          "",
          "- Returns `null` when unset.",
          "",
          "```ts",
          "// prose fences stay in the prose",
          "```",
          "",
          "**Gotchas**",
          "",
          "- Keys are case-sensitive.",
          "",
          "**Example** (Reading a URL)",
          "",
          "```ts",
          'const url = await ens.record.getText({ name, key: "url" })',
          "",
          "```",
          "",
          "@throws `Errors.InvalidInputError` (`INVALID_NAME`) for an invalid",
          "name.",
          "@see {@link Actions.record.get} to read several records",
          "@stability stable",
        ],
        "\n",
      ),
    );

    assert.strictEqual(doc.summary, "Reads one text record.");
    assert.strictEqual(doc.whenToUse, "Use to show a profile field.");
    assert.strictEqual(
      doc.details,
      "- Returns `null` when unset.\n\n```ts\n// prose fences stay in the prose\n```",
    );
    assert.strictEqual(doc.gotchas, "- Keys are case-sensitive.");
    assert.deepStrictEqual(doc.examples, [
      {
        title: "Reading a URL",
        language: "ts",
        code: 'const url = await ens.record.getText({ name, key: "url" })',
      },
    ]);
    assert.deepStrictEqual(tagValues(doc, "throws"), [
      "`Errors.InvalidInputError` (`INVALID_NAME`) for an invalid name.",
    ]);
    assert.deepStrictEqual(tagValues(doc, "see"), [
      "{@link Actions.record.get} to read several records",
    ]);
  });
});

describe("throwsOf", () => {
  it("reads the class, the codes in parentheses and the condition", () => {
    assert.deepStrictEqual(
      throwsOf("`Errors.NotFoundError` (`RECORD_NOT_FOUND`, `RESOLVER_NOT_FOUND`) with `strict`."),
      {
        errorClass: "NotFoundError",
        codes: ["RECORD_NOT_FOUND", "RESOLVER_NOT_FOUND"],
        when: "with `strict`.",
      },
    );
  });

  it("allows a class without codes, and a package's own class", () => {
    assert.deepStrictEqual(throwsOf("`Errors.NetworkError` when the RPC request fails."), {
      errorClass: "NetworkError",
      codes: [],
      when: "when the RPC request fails.",
    });
    assert.deepStrictEqual(throwsOf("`HcaError` (`HCA_UNAVAILABLE`) off the HCA chains."), {
      errorClass: "HcaError",
      codes: ["HCA_UNAVAILABLE"],
      when: "off the HCA chains.",
    });
  });

  it("keeps a free-form tag as its condition", () => {
    assert.deepStrictEqual(throwsOf("The first request's error with `allowFailure: false`."), {
      errorClass: "",
      codes: [],
      when: "The first request's error with `allowFailure: false`.",
    });
  });
});
