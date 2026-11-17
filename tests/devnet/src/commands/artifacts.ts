import { Console, Effect, FileSystem, Path } from "effect";
import { Command } from "effect/cli";

import { deriveAll } from "../artifacts/derive.ts";
import { artifactFile, serialize } from "../artifacts/files.ts";
import { ArtifactError } from "../errors.ts";

const refresh = Command.make("refresh", {}, () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const derived = yield* deriveAll();
    for (const [name, artifact] of derived) {
      const file = artifactFile(name);
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, serialize(artifact));
    }
    yield* Console.log(`artifacts: wrote ${derived.size}`);
  }),
).pipe(Command.withDescription("Re-derive every artifact from its pinned source and write it"));

const check = Command.make("check", {}, () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const derived = yield* deriveAll();
    const stale: string[] = [];
    for (const [name, artifact] of derived) {
      const file = artifactFile(name);
      const committed = (yield* fs.exists(file)) ? yield* fs.readFileString(file) : "";
      if (committed !== serialize(artifact)) stale.push(name);
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
