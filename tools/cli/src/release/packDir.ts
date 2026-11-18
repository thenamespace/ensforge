import { createHash } from "node:crypto";

import { Array as Arr, Effect, FileSystem, Order, Path, Schema } from "effect";

import { SetupError } from "../errors.ts";

/**
 * A release in the publish plan `changeset pack` writes next to its tarballs
 * (`<pack-dir>/publish-plan.json`, tarballs under `<pack-dir>/packages`).
 */
const Release = Schema.Struct({
  kind: Schema.String,
  name: Schema.String,
  version: Schema.String,
  tarball: Schema.optionalKey(
    Schema.Struct({
      /** Relative to the pack dir, e.g. `packages/ensforge-sdk-1.0.0.tgz`. */
      path: Schema.String,
      /** `sha256-<base64>` of the tarball. */
      integrity: Schema.String,
    }),
  ),
});

const PublishPlan = Schema.Struct({
  version: Schema.Literal(1),
  plan: Schema.Array(Schema.Array(Release)),
});

/** A package the plan publishes, with its tarball. */
export type PackedRelease = {
  readonly name: string;
  readonly version: string;
  readonly tarball: string;
  readonly integrity: string;
};

/** `<algorithm>-<base64>` of `bytes`, the format of npm's and Changesets' integrity fields. */
export const integrityOf = (algorithm: "sha256" | "sha512", bytes: Uint8Array) =>
  `${algorithm}-${createHash(algorithm).update(bytes).digest("base64")}`;

/** The plan's publish releases; a publish release without a tarball is a problem. */
export const packedReleases = (plan: typeof PublishPlan.Type) => {
  const releases: PackedRelease[] = [];
  const problems: string[] = [];
  for (const release of plan.plan.flat()) {
    if (release.kind !== "publish") continue;
    if (release.tarball === undefined) {
      problems.push(`${release.name}@${release.version}: no tarball in the publish plan`);
      continue;
    }
    releases.push({
      name: release.name,
      version: release.version,
      tarball: release.tarball.path,
      integrity: release.tarball.integrity,
    });
  }
  return { releases, problems };
};

/**
 * Compares the plan with the packages the repository publishes and the tarballs on disk
 * (`sha256` integrity by tarball path): every publishable package is released once, nothing else
 * is, and each tarball matches the plan.
 */
export const planProblems = (
  releases: readonly PackedRelease[],
  publishable: readonly string[],
  integrities: ReadonlyMap<string, string | undefined>,
) => {
  const problems: string[] = [];
  for (const name of publishable) {
    const count = releases.filter((release) => release.name === name).length;
    if (count === 0) problems.push(`${name}: not in the publish plan`);
    if (count > 1) problems.push(`${name}: released ${count} times`);
  }
  for (const release of releases) {
    const id = `${release.name}@${release.version}`;
    if (!publishable.includes(release.name)) problems.push(`${id}: not a publishable package`);
    const actual = integrities.get(release.tarball);
    if (actual === undefined) problems.push(`${id}: ${release.tarball} is missing`);
    else if (actual !== release.integrity)
      problems.push(`${id}: ${release.tarball} is ${actual}, the plan says ${release.integrity}`);
  }
  return problems;
};

/** Reads a pack dir's publish plan and the integrity of the tarballs it names. */
export const readPackDir = Effect.fn("readPackDir")(function* (packDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const planFile = path.join(packDir, "publish-plan.json");

  const plan = yield* fs.readFileString(planFile).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(PublishPlan))),
    Effect.mapError((cause) => new SetupError({ message: `${planFile}: ${String(cause)}` })),
  );
  const { releases, problems } = packedReleases(plan);

  // Read failures of files that exist are not expected outcomes: they stay defects.
  const integrities = new Map<string, string | undefined>();
  for (const release of releases) {
    const file = path.join(packDir, release.tarball);
    const exists = yield* fs.exists(file).pipe(Effect.orDie);
    integrities.set(
      release.tarball,
      exists ? integrityOf("sha256", yield* fs.readFile(file).pipe(Effect.orDie)) : undefined,
    );
  }
  return { releases, problems, integrities };
});

/** `sha256` of every file under `dir` but `except`, keyed by relative path. */
export const checksums = Effect.fn("checksums")(function* (dir: string, except: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = yield* fs.readDirectory(dir, { recursive: true });
  const sums = new Map<string, string>();
  for (const file of Arr.sort(files, Order.String)) {
    const full = path.join(dir, file);
    if (file === except || (yield* fs.stat(full)).type !== "File") continue;
    sums.set(file, integrityOf("sha256", yield* fs.readFile(full)));
  }
  return sums;
}, Effect.orDie);
