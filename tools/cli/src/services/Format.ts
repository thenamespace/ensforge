import { Effect, FileSystem, Path } from "effect";

import { Tools } from "./Tools.ts";
import { Workspace } from "./Workspace.ts";

/** Formats files with the repository's oxfmt config (`.config/oxfmt.config.ts`). */
export const formatFiles = Effect.fn("formatFiles")(function* (files: readonly string[]) {
  const workspace = yield* Workspace;
  const tools = yield* Tools;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = path.join(workspace.root, ".config/oxfmt.config.ts");

  yield* tools.run(
    "pnpm",
    ["exec", "oxfmt", ...((yield* fs.exists(config)) ? ["-c", config] : []), ...files],
    { cwd: workspace.root },
  );
});
