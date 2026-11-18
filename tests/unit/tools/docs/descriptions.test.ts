/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string, effecttsgo/global-date -- plain string and value checks in a unit test */
import { assert, describe, it } from "@effect/vitest";

import { describe as describePage, keywordsFor } from "@ensforge/tools/internal/docs/descriptions";
import { descriptionRange } from "@ensforge/tools/internal/docs/lint";

const inRange = (text: string) =>
  text.length >= descriptionRange.min && text.length <= descriptionRange.max;

describe("describe", () => {
  it("adds the fillers that fit until the description is long enough", () => {
    const text = describePage(
      "Reads one record of a name",
      "x".repeat(150),
      "Parameters, return value, errors and examples for record.get in @ensforge/sdk.",
      "Includes examples.",
    );

    assert.strictEqual(
      text,
      "Reads one record of a name. Parameters, return value, errors and examples for record.get in @ensforge/sdk. Includes examples.",
    );
    assert.isTrue(inRange(text));
  });

  it("clips a long lead at a word and ends it with a full stop", () => {
    const text = describePage(`Reads ${"records of a name and more ".repeat(10)}`);

    assert.isTrue(inRange(text));
    assert.isTrue(text.endsWith("."));
    assert.isFalse(text.endsWith(" ."));
  });

  it("stops adding fillers once the range is reached", () => {
    const lead = `Reads ${"a".repeat(125)}.`;

    assert.strictEqual(describePage(lead, "Includes examples."), lead);
  });
});

describe("keywordsFor", () => {
  it("lists the given names first, then ENS terms of the domain, without repeats", () => {
    const keywords = keywordsFor(["record.get", "resolver"], "record");

    assert.deepStrictEqual(keywords.slice(0, 2), ["record.get", "resolver"]);
    assert.include(keywords, "text record");
    assert.strictEqual(keywords.filter((keyword) => keyword === "resolver").length, 1);
  });

  it("returns only the names for an unknown domain", () => {
    assert.deepStrictEqual(keywordsFor(["a"], "nothing"), ["a"]);
  });
});
