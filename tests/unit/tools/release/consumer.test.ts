import { assert, describe, it } from "@effect/vitest";

import { consumerManifests, publicEntries } from "@ensforge/tools/internal/release/consumer";

describe("consumerManifests", () => {
  it("installs the tarballs, overrides their dependencies on each other, and adds every peer", () => {
    const releases = ["contracts", "sdk"].map((name) => ({
      name: `@ensforge/${name}`,
      version: "1.0.0",
      tarball: `packages/ensforge-${name}-1.0.0.tgz`,
      integrity: "sha256-a",
    }));

    const manifests = consumerManifests(releases, (release) => `/tmp/${release.tarball}`, {
      viem: "^2.57.0",
      react: "^19.0.0",
      "@ensforge/sdk": "1.0.0",
    });

    const tarballs = {
      "@ensforge/contracts": "file:/tmp/packages/ensforge-contracts-1.0.0.tgz",
      "@ensforge/sdk": "file:/tmp/packages/ensforge-sdk-1.0.0.tgz",
    };
    assert.deepStrictEqual(manifests.packageJson.dependencies, {
      viem: "^2.57.0",
      react: "^19.0.0",
      "@types/react": "^19.0.0",
      ...tarballs,
    });
    assert.deepStrictEqual(manifests.workspace, { overrides: tarballs });
  });
});

describe("publicEntries", () => {
  it("imports each published subpath, but not package.json or patterns", () => {
    assert.deepStrictEqual(
      publicEntries("@ensforge/sdk", {
        ".": "./dist/index.js",
        "./effect": "./dist/effect.js",
        "./internal/*": "./dist/*.js",
        "./package.json": "./package.json",
      }),
      ["@ensforge/sdk", "@ensforge/sdk/effect"],
    );
  });
});
