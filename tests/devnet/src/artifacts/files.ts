import { Effect, FileSystem, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { ArtifactError } from "../errors.ts";
import { artifactsDir, packageDir } from "../package.ts";
import type { Artifact } from "./derive.ts";
import type { ArtifactName } from "./sources.ts";

export const artifactFile = (name: ArtifactName, dir = artifactsDir): string =>
  `${dir}/${name}.json`;

/**
 * Writes `artifacts` under `dir` formatted with the repository's oxfmt config, so committed files
 * and `artifacts check` agree with `pnpm format`.
 */
export const writeArtifacts = Effect.fn("writeArtifacts")(function* (
  artifacts: ReadonlyMap<ArtifactName, Artifact>,
  dir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const files: string[] = [];
  for (const [name, artifact] of artifacts) {
    const file = artifactFile(name, dir);
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, JSON.stringify(artifact));
    files.push(file);
  }

  const root = path.join(packageDir, "../..");
  const handle = yield* spawner.spawn(
    ChildProcess.make(
      "pnpm",
      ["exec", "oxfmt", "-c", path.join(root, ".config/oxfmt.config.ts"), ...files],
      { cwd: root, stdout: "ignore", stderr: "ignore" },
    ),
  );
  if ((yield* handle.exitCode) !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new ArtifactError({ artifact: dir, message: "oxfmt failed" });
  }
}, Effect.scoped);

const cache = new Map<ArtifactName, Artifact>();

/** A committed artifact, read once per process. */
export const loadArtifact = (
  name: ArtifactName,
): Effect.Effect<Artifact, ArtifactError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const cached = cache.get(name);
    if (cached !== undefined) return cached;

    const fs = yield* FileSystem.FileSystem;
    const artifact = JSON.parse(yield* fs.readFileString(artifactFile(name))) as Artifact;
    cache.set(name, artifact);
    return artifact;
  }).pipe(
    Effect.mapError(
      (cause) =>
        new ArtifactError({
          artifact: name,
          message: `${String(cause)}; run \`ensforge-devnet artifacts refresh\``,
        }),
    ),
  );
