import { Console, DateTime, Effect, FileSystem, Path, Schema } from "effect";
import { Command, Flag } from "effect/cli";

import { CheckFailed, SetupError, type ToolFailed } from "../errors.ts";
import { consumerManifests, entriesModule, publicEntries } from "../release/consumer.ts";
import { checksums, integrityOf, planProblems, readPackDir } from "../release/packDir.ts";
import { Tools } from "../services/Tools.ts";
import { TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";
import { measure, overBudget, readBudgets, scenarios } from "./bundleSize.ts";

const PackageManifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    private: Schema.optionalKey(Schema.Boolean),
    exports: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
    peerDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
);

const fail = (problems: readonly string[]) =>
  problems.length === 0
    ? Effect.void
    : Effect.fail(new CheckFailed({ check: "release-check", problems }));

/** The packages under `packages/` that are not private: what every release publishes. */
const publishablePackages = Effect.fn("releaseCheck.publishablePackages")(
  function* (root: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const packagesDir = path.join(root, "packages");
    const found = [];
    for (const folder of (yield* fs.readDirectory(packagesDir)).toSorted()) {
      const dir = path.join(packagesDir, folder);
      const file = path.join(dir, "package.json");
      if (!(yield* fs.exists(file))) continue;
      const manifest = yield* fs.readFileString(file).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(PackageManifest)),
        Effect.mapError((cause) => new SetupError({ message: `${file}: ${String(cause)}` })),
      );
      if (manifest.private !== true) found.push({ dir, manifest });
    }
    return found;
  },
  Effect.catchTag("PlatformError", (cause) => new SetupError({ message: String(cause) })),
);

/**
 * Verifies a `changeset pack` directory before it is published: the plan releases every
 * publishable package with a tarball matching its integrity; publint and attw pass on each
 * tarball; a throwaway app installs the tarballs, imports every public entry in Node and compiles
 * them (and each package's `verify/consumer.ts`) with `nodenext` resolution; the installed bundles
 * fit the budgets. Writes `<pack-dir>/verification.json` and never changes the plan or archives.
 */
export const releaseCheck = Effect.fn("releaseCheck")(
  function* (packDirArgument: string) {
    const workspace = yield* Workspace;
    const tools = yield* Tools;
    const typescript = yield* TypeScript;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const packDir = path.resolve(packDirArgument);
    const reportFile = path.join(packDir, "verification.json");

    const before = yield* checksums(packDir, "verification.json");
    const { releases, problems: readProblems, integrities } = yield* readPackDir(packDir);
    const packages = yield* publishablePackages(workspace.root);

    const checks: Array<{ readonly name: string; readonly problems: readonly string[] }> = [];
    const step = <R>(name: string, check: Effect.Effect<unknown, CheckFailed | ToolFailed, R>) =>
      check.pipe(
        Effect.as<readonly string[]>([]),
        Effect.catchTags({
          CheckFailed: (failed) => Effect.succeed(failed.problems),
          ToolFailed: (failed) => Effect.succeed([`${failed.tool}:`, failed.output.trim()]),
        }),
        Effect.tap((problems) => Effect.sync(() => checks.push({ name, problems }))),
        Effect.map((problems) => problems.length === 0),
      );

    const planOk = yield* step(
      "plan",
      fail([
        ...readProblems,
        ...planProblems(
          releases,
          packages.map(({ manifest }) => manifest.name),
          integrities,
        ),
      ]),
    );

    if (planOk) {
      const consumer = yield* fs.makeTempDirectoryScoped({ prefix: "ensforge-release-check-" });
      const tarballOf = (release: { readonly tarball: string }) =>
        path.join(consumer, "tarballs", path.basename(release.tarball));
      yield* fs.makeDirectory(path.join(consumer, "tarballs"));
      for (const release of releases)
        yield* fs.copyFile(path.join(packDir, release.tarball), tarballOf(release));

      for (const release of releases) {
        yield* step(`publint ${release.name}`, tools.run("publint", ["run", tarballOf(release)]));
        yield* step(
          `attw ${release.name}`,
          tools.run("attw", [tarballOf(release), "--profile", "esm-only", "--format", "ascii"]),
        );
      }

      const peers = Object.assign(
        {},
        ...packages.map(({ manifest }) => manifest.peerDependencies ?? {}),
      ) as Record<string, string>;
      const manifests = consumerManifests(releases, tarballOf, peers);
      yield* fs.writeFileString(
        path.join(consumer, "package.json"),
        JSON.stringify(manifests.packageJson, null, 2),
      );
      yield* fs.writeFileString(
        path.join(consumer, "pnpm-workspace.yaml"),
        JSON.stringify(manifests.workspace, null, 2),
      );
      // No lockfile exists yet; pnpm defaults to a frozen lockfile in CI.
      const installed = yield* step(
        "consumer install",
        tools.run("pnpm", ["install", "--no-frozen-lockfile", "--prefer-offline"], {
          cwd: consumer,
        }),
      );

      if (installed) {
        const specifiers: string[] = [];
        for (const release of releases) {
          const file = path.join(consumer, "node_modules", release.name, "package.json");
          const manifest = yield* fs.readFileString(file).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(PackageManifest)),
            Effect.mapError((cause) => new SetupError({ message: `${file}: ${String(cause)}` })),
          );
          specifiers.push(...publicEntries(release.name, manifest.exports ?? {}));
        }
        const entries = entriesModule(specifiers);
        yield* fs.writeFileString(path.join(consumer, "entries.mjs"), entries);
        yield* fs.writeFileString(path.join(consumer, "entries.ts"), entries);
        yield* step(
          `consumer imports (${specifiers.length} entries)`,
          tools.run(process.execPath, ["entries.mjs"], { cwd: consumer }),
        );

        const typed = [path.join(consumer, "entries.ts")];
        for (const { dir } of packages) {
          const fixture = path.join(dir, "verify/consumer.ts");
          if (!(yield* fs.exists(fixture))) continue;
          const copy = path.join(consumer, `consumer-${path.basename(dir)}.ts`);
          yield* fs.copyFile(fixture, copy);
          typed.push(copy);
        }
        const config = yield* typescript.writeConfig(consumer, {
          compilerOptions: {
            module: "nodenext",
            moduleResolution: "nodenext",
            target: "es2022",
            lib: ["es2022", "dom"],
            types: [],
            strict: true,
            exactOptionalPropertyTypes: true,
            skipLibCheck: true,
            noEmit: true,
          },
          files: typed,
        });
        yield* step(
          "consumer types",
          typescript.tsc(["-p", config, "--pretty", "false"], { cwd: consumer }),
        );

        const budgets = yield* readBudgets(workspace.root);
        yield* step(
          "bundle budgets",
          Effect.forEach(Object.entries(scenarios), ([name, [, source]], index) =>
            measure(path.join(consumer, "bundles", String(index)), source).pipe(
              Effect.catchTag("PlatformError", Effect.die),
              Effect.map((size) => [name, size] as const),
            ),
          ).pipe(Effect.flatMap((sizes) => fail(overBudget(sizes, budgets)))),
        );
      }
    }

    const after = yield* checksums(packDir, "verification.json");
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
      (file) => before.get(file) !== after.get(file),
    );
    yield* step(
      "pack dir unchanged",
      fail(changed.map((file) => `${file} changed during the check`)),
    );

    const packed = [];
    for (const release of releases) {
      const file = path.join(packDir, release.tarball);
      packed.push({
        ...release,
        npmIntegrity: (yield* fs.exists(file))
          ? integrityOf("sha512", yield* fs.readFile(file))
          : null,
      });
    }
    const problems = checks.flatMap((check) =>
      check.problems.length === 0 ? [] : [`[${check.name}]`, ...check.problems],
    );
    yield* fs.writeFileString(
      reportFile,
      `${JSON.stringify(
        {
          ok: problems.length === 0,
          checkedAt: DateTime.formatIso(yield* DateTime.now),
          packages: packed,
          checks: checks.map((check) => ({ ...check, ok: check.problems.length === 0 })),
        },
        null,
        2,
      )}\n`,
    );

    for (const check of checks)
      yield* Console.log(`${check.problems.length === 0 ? "ok  " : "FAIL"}  ${check.name}`);
    if (problems.length > 0) return yield* new CheckFailed({ check: "release-check", problems });
    yield* Console.log(`release-check: ok (${releases.length} packages, ${reportFile})`);
  },
  Effect.scoped,
  Effect.catchTag("PlatformError", (cause) => new SetupError({ message: String(cause) })),
);

export const releaseCheckCommand = Command.make(
  "check",
  {
    packDir: Flag.Directory("pack-dir", { mustExist: true }).pipe(
      Flag.withDescription("Directory written by `changeset pack --out-dir`"),
    ),
  },
  ({ packDir }) => releaseCheck(packDir),
).pipe(Command.withDescription("Verify packed release tarballs before they are published"));
