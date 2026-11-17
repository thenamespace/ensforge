import { Effect, FileSystem, Path } from "effect";
import { Command, Flag } from "effect/cli";

import { TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";

/**
 * Builds `dist` with tsc: one ES module and declaration per source file. tsc keeps
 * `export * as X` re-exports, which app bundlers tree-shake. Dependencies resolve to their built
 * `dist` (no `workspace-source` condition), so nothing outside `src` is emitted.
 */
export const build = Effect.fn("build")(function* (watch: boolean) {
  const workspace = yield* Workspace;
  const typescript = yield* TypeScript;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  if (!watch)
    yield* fs.remove(path.join(workspace.packageDir, "dist"), { recursive: true, force: true });
  yield* typescript.tsc(
    [
      "-p",
      "tsconfig.json",
      "--noEmit",
      "false",
      "--allowImportingTsExtensions",
      "false",
      "--customConditions",
      "null",
      "--rootDir",
      "src",
      "--outDir",
      "dist",
      "--declaration",
      "--declarationMap",
      "--sourceMap",
      ...(watch ? ["--watch"] : []),
    ],
    { cwd: workspace.packageDir, inherit: true },
  );
});

export const buildCommand = Command.make(
  "build",
  {
    watch: Flag.Boolean("watch").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Rebuild on changes"),
    ),
  },
  ({ watch }) => build(watch),
).pipe(Command.withDescription("Build the package's dist with tsc"));
