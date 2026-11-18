import { Effect, FileSystem, Formatter, Path, Predicate, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { ArtifactError } from "../errors.ts";
import { artifactsDir, packageDir } from "../package.ts";
import type { Artifact } from "./derive.ts";
import { AbiSchema, HexSchema, readJson } from "./json.ts";
import type { ArtifactName } from "./sources.ts";

const ArtifactFile = Schema.Struct({
  abi: AbiSchema,
  bytecode: HexSchema,
  source: Schema.declare((value): value is Artifact["source"] =>
    Predicate.hasProperty(value, "kind"),
  ),
});

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
    yield* fs.writeFileString(file, Formatter.formatJson(artifact));
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
  const exitCode = yield* handle.exitCode;
  if (exitCode === ChildProcessSpawner.ExitCode(0)) return yield* Effect.void;
  return yield* ArtifactError.make({ artifact: dir, message: "oxfmt failed" });
}, Effect.scoped);

const cache = new Map<ArtifactName, Artifact>();

/** A committed artifact, read once per process. */
export const loadArtifact = (
  name: ArtifactName,
): Effect.Effect<Artifact, ArtifactError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const cached = cache.get(name);
    if (cached !== undefined) return cached;

    const artifact = yield* readJson(artifactFile(name), ArtifactFile).pipe(
      Effect.mapError((error) =>
        ArtifactError.make({
          artifact: name,
          message: `${error.message}; run \`ensforge-devnet artifacts refresh\``,
        }),
      ),
    );
    cache.set(name, artifact);
    return artifact;
  });
