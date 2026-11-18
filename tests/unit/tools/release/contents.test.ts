import { assert, describe, it } from "@effect/vitest";

import { contentProblems } from "@ensforge/tools/internal/release/contents";

describe("contentProblems", () => {
  const complete = ["package.json", "README.md", "LICENSE", "CHANGELOG.md", "dist/index.js"];

  it("accepts a package with its metadata files and maps whose sources ship", () => {
    const problems = contentProblems(
      "@ensforge/sdk",
      [...complete, "dist/index.js.map", "dist/a/b.js.map", "src/index.ts", "src/a/b.ts"],
      new Map([
        ["dist/index.js.map", ["../src/index.ts"]],
        ["dist/a/b.js.map", ["../../src/a/b.ts"]],
      ]),
      { "@ensforge/contracts": "1.0.0", viem: "^2.57.0" },
    );

    assert.deepStrictEqual(problems, []);
  });

  it("reports missing metadata, forbidden files, unshipped map sources and pnpm-only ranges", () => {
    const problems = contentProblems(
      "@ensforge/sdk",
      ["package.json", "dist/index.js.map", "dist/.env", "tsconfig.tsbuildinfo", "test/a.ts"],
      new Map([["dist/index.js.map", ["../src/index.ts"]]]),
      { "@ensforge/contracts": "workspace:*", viem: "catalog:" },
    );

    assert.deepStrictEqual(problems, [
      "@ensforge/sdk: README.md is missing",
      "@ensforge/sdk: LICENSE is missing",
      "@ensforge/sdk: CHANGELOG.md is missing",
      "@ensforge/sdk: dist/.env must not be published",
      "@ensforge/sdk: tsconfig.tsbuildinfo must not be published",
      "@ensforge/sdk: test/a.ts must not be published",
      "@ensforge/sdk: dist/index.js.map names ../src/index.ts, not shipped",
      "@ensforge/sdk: @ensforge/contracts@workspace:* is not installable from npm",
      "@ensforge/sdk: viem@catalog: is not installable from npm",
    ]);
  });
});
