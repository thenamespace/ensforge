import { Console, Effect, FileSystem } from "effect";
import { Command } from "effect/cli";

import { deriveAll } from "../artifacts/derive.ts";
import { artifactFile, writeArtifacts } from "../artifacts/files.ts";
import { ArtifactError } from "../errors.ts";
import { artifactsDir, cacheDir } from "../package.ts";

const refresh = Command.make("refresh", {}, () =>
  Effect.gen(function* () {
    const derived = yield* deriveAll();
    yield* writeArtifacts(derived, artifactsDir);
    yield* Console.log(`artifacts: wrote ${derived.size}`);
  }),
).pipe(Command.withDescription("Re-derive every artifact from its pinned source and write it"));

const check = Command.make("check", {}, () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const staged = `${cacheDir}/artifacts-check`;

    const derived = yield* deriveAll();
    yield* fs.remove(staged, { recursive: true, force: true });
    yield* writeArtifacts(derived, staged);
    const stale: string[] = [];
    for (const name of derived.keys()) {
      const committed = artifactFile(name);
      const matches =
        (yield* fs.exists(committed)) &&
        (yield* fs.readFileString(committed)) ===
          (yield* fs.readFileString(artifactFile(name, staged)));
      if (!matches) stale.push(name);
    }
    if (stale.length > 0) {
      return yield* new ArtifactError({
        artifact: stale.join(", "),
        message: "differs from its source; run `ensforge-devnet artifacts refresh`",
      });
    }
    yield* Console.log(`artifacts: ok (${derived.size})`);
  }),
).pipe(Command.withDescription("Fail when a committed artifact differs from its source"));

export const artifactsCommand = Command.make("artifacts").pipe(
  Command.withDescription("Manage the committed contract artifacts"),
  Command.withSubcommands([refresh, check]),
);
