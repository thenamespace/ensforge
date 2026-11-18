/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string -- synchronous text scanning of Markdown, where native string and array methods read more directly than curried Effect ones */
import { assert, describe, it } from "@effect/vitest";

import { parseFrontmatter, urlOf, type DocsPage } from "@ensforge/tools/internal/docs/content";
import { isListed, lintPages, slugOf } from "@ensforge/tools/internal/docs/lint";

const page = (file: string, description: string, body = ""): DocsPage => ({
  file,
  url: urlOf(file),
  frontmatter: { title: "T", description },
  generated: false,
  body,
});

const generated = (files: readonly string[]): DocsPage[] =>
  files.map((file) => ({ ...page(file, ""), generated: true }));

describe("urlOf", () => {
  it("drops route groups and index", () => {
    assert.strictEqual(urlOf("sdk/(lists)/a.mdx"), "/docs/sdk/a");
    assert.strictEqual(urlOf("sdk/index.mdx"), "/docs/sdk");
  });
});

describe("parseFrontmatter", () => {
  it("reads quoted and plain values", () => {
    const { frontmatter, body } = parseFrontmatter('---\ntitle: "A: b"\ngenerated: true\n---\nHi');

    assert.deepStrictEqual(frontmatter, { title: "A: b", generated: "true" });
    assert.strictEqual(body, "Hi");
  });
});

describe("slugOf", () => {
  it("slugs headings like github-slugger and numbers repeats", () => {
    const seen = new Map<string, number>();

    assert.strictEqual(slugOf("Reading `ens.name` (v2)?", seen), "reading-ensname-v2");
    assert.strictEqual(slugOf("Plan", seen), "plan");
    assert.strictEqual(slugOf("Plan", seen), "plan-1");
  });
});

describe("lintPages", () => {
  const ok = "x".repeat(130);

  it("checks description length, links and anchors, outside code fences", () => {
    const problems = lintPages([
      page(
        "a.mdx",
        "short",
        "[b](/docs/b#route) [c](/docs/b#nope) [d](/docs/missing)\n```md\n[e](/docs/nope)\n```",
      ),
      page("b.mdx", ok, "## Route\n"),
    ]);

    assert.strictEqual(problems.descriptions.length, 1);
    assert.deepStrictEqual(problems.links, [
      'a.mdx:1: /docs/b#nope has no heading "nope"',
      "a.mdx:1: /docs/missing does not match a page",
    ]);
    assert.strictEqual(problems.budget.characters, 5 + 1 + ok.length + 1);
  });

  it("fails the budget when descriptions and titles are too long", () => {
    const pages = Array.from({ length: 400 }, (_, index) => page(`p${index}.mdx`, "y".repeat(160)));

    assert.strictEqual(lintPages(pages).budget.problems.length, 1);
  });
});

describe("isListed", () => {
  it("lists landing, package, domain, non-hook and class pages but not actions, hooks or codes", () => {
    const listed = [
      "sdk/index.mdx",
      "sdk/(upgrading)/guide.mdx",
      "reference/index.mdx",
      "reference/sdk/client.mdx",
      "reference/sdk/record/index.mdx",
      "reference/contracts/abis.mdx",
      "reference/react/components.mdx",
      "reference/errors/(config-error)/config-error.mdx",
    ];
    const hidden = [
      "reference/sdk/record/get.mdx",
      "reference/react/(hooks)/use-read.mdx",
      "reference/hca/hca/route.mdx",
      "reference/errors/(config-error)/INVALID_CONFIG.mdx",
    ];

    assert.deepStrictEqual(
      generated(listed).filter((entry) => !isListed(entry)),
      [],
    );
    assert.deepStrictEqual(generated(hidden).filter(isListed), []);
  });
});
