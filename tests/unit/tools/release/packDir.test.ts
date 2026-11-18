import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import {
  checksums,
  integrityOf,
  packedReleases,
  planProblems,
  readPackDir,
} from "@ensforge/tools/internal/release/packDir";

const sdk = {
  name: "@ensforge/sdk",
  version: "1.0.0",
  tarball: "packages/ensforge-sdk-1.0.0.tgz",
  integrity: "sha256-a",
};

describe("packedReleases", () => {
  it("keeps publish releases and reports one without a tarball", () => {
    const { releases, problems } = packedReleases({
      version: 1,
      plan: [
        [
          {
            kind: "publish",
            name: sdk.name,
            version: sdk.version,
            tarball: { path: sdk.tarball, integrity: sdk.integrity },
          },
          { kind: "tag", name: "@ensforge/contracts", version: "1.0.0" },
        ],
        [{ kind: "publish", name: "@ensforge/hca", version: "1.0.0" }],
      ],
    });

    assert.deepStrictEqual(releases, [sdk]);
    assert.deepStrictEqual(problems, ["@ensforge/hca@1.0.0: no tarball in the publish plan"]);
  });
});

describe("planProblems", () => {
  it("passes when every publishable package has its matching tarball", () => {
    assert.deepStrictEqual(
      planProblems([sdk], [sdk.name], new Map([[sdk.tarball, sdk.integrity]])),
      [],
    );
  });

  it("reports missing packages, extra releases, missing tarballs and changed tarballs", () => {
    const extra = { ...sdk, name: "@ensforge/test-devnet", tarball: "packages/devnet.tgz" };

    assert.deepStrictEqual(
      planProblems(
        [sdk, extra],
        [sdk.name, "@ensforge/react"],
        new Map([[sdk.tarball, "sha256-b"]]),
      ),
      [
        "@ensforge/react: not in the publish plan",
        "@ensforge/sdk@1.0.0: packages/ensforge-sdk-1.0.0.tgz is sha256-b, the plan says sha256-a",
        "@ensforge/test-devnet@1.0.0: not a publishable package",
        "@ensforge/test-devnet@1.0.0: packages/devnet.tgz is missing",
      ],
    );
  });
});

describe("readPackDir", () => {
  it.effect("reads the plan with the tarballs' integrity, and checksums every other file", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const tarball = new TextEncoder().encode("tarball");
      yield* fs.makeDirectory(path.join(dir, "packages"));
      yield* fs.writeFile(path.join(dir, sdk.tarball), tarball);
      yield* fs.writeFileString(
        path.join(dir, "publish-plan.json"),
        JSON.stringify({
          version: 1,
          plan: [
            [
              {
                kind: "publish",
                name: sdk.name,
                version: sdk.version,
                tarball: { path: sdk.tarball, integrity: integrityOf("sha256", tarball) },
              },
            ],
          ],
        }),
      );
      yield* fs.writeFileString(path.join(dir, "verification.json"), "{}");

      const packed = yield* readPackDir(dir);
      const sums = yield* checksums(dir, "verification.json");

      assert.deepStrictEqual(packed.problems, []);
      assert.strictEqual(packed.integrities.get(sdk.tarball), packed.releases[0]?.integrity);
      assert.deepStrictEqual(
        [...sums.keys()],
        ["packages/ensforge-sdk-1.0.0.tgz", "publish-plan.json"],
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
