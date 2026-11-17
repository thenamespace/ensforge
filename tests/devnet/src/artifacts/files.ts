import { Effect, FileSystem } from "effect";

import { ArtifactError } from "../errors.ts";
import { artifactsDir } from "../package.ts";
import type { Artifact } from "./derive.ts";
import type { ArtifactName } from "./sources.ts";

/** One ABI item per line keeps diffs readable without pretty-printing the bytecode. */
export const serialize = (artifact: Artifact): string =>
  [
    "{",
    `  "source": ${JSON.stringify(artifact.source)},`,
    '  "abi": [',
    artifact.abi.map((item) => `    ${JSON.stringify(item)}`).join(",\n"),
    "  ],",
    `  "bytecode": ${JSON.stringify(artifact.bytecode)}`,
    "}",
    "",
  ].join("\n");

export const artifactFile = (name: ArtifactName): string => `${artifactsDir}/${name}.json`;

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
