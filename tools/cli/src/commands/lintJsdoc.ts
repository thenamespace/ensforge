import { Array as Arr, Console, Effect, FileSystem, Path, String as Str } from "effect";
import { Command } from "effect/cli";

import { CheckFailed } from "../errors.ts";
import { actionFilesOf, checkActionFile } from "../lint-jsdoc/actions.ts";
import { undocumentedExports } from "../lint-jsdoc/declarations.ts";
import { brokenLinks, exportedPaths } from "../lint-jsdoc/links.ts";
import { untaggedExports } from "../lint-jsdoc/stability.ts";
import { TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";

/**
 * Checks the package's documentation: every export reachable from the API entries has JSDoc,
 * every export reachable from any published entry has a `@stability` tag, action files follow the
 * Effect-style format, and every `{@link}` resolves.
 */
export const lintJsdoc = Effect.fn("lintJsdoc")(function* () {
  const workspace = yield* Workspace;
  const typescript = yield* TypeScript;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const src = path.join(workspace.packageDir, "src");

  const relativePaths = yield* fs.readDirectory(src, { recursive: true });
  const sourceFiles = Arr.map(
    Arr.filter(relativePaths, (file) => /\.tsx?$/.test(file)),
    (file) => path.join(src, file),
  );
  const project = yield* typescript.open(sourceFiles);
  const entries = Arr.map(workspace.entriesOf(workspace.config.api), (entry) => entry.source);

  // The package's own error classes plus the sdk's, which extension packages also throw.
  const errorClasses = new Set<string>();
  for (const folder of [
    path.join(src, "errors/classes"),
    path.join(workspace.root, "packages/sdk/src/errors/classes"),
  ]) {
    if (!(yield* fs.exists(folder))) continue;
    for (const file of yield* fs.readDirectory(folder))
      errorClasses.add(Str.replace(/\.ts$/, "")(file));
  }

  const existing = new Set(sourceFiles);
  const declarations = undocumentedExports(project, entries, (file) => existing.has(file));
  const actionsFolder = path.join(src, "actions");
  const actionFiles = actionFilesOf(
    actionsFolder,
    Arr.map(
      Arr.filter(relativePaths, (file) => Str.startsWith("actions/")(file)),
      (file) => Str.slice(8)(file),
    ),
  );
  const exported = exportedPaths(
    project,
    Arr.map(workspace.entries, (entry) => entry.source),
  );

  const untagged = untaggedExports(
    project,
    Arr.map(workspace.entries, (entry) => ({
      name: `${workspace.name}${Str.slice(1)(entry.subpath)}`,
      source: entry.source,
    })),
  );

  const located: ReadonlyArray<readonly [string, string]> = [
    ...Arr.map(declarations.problems, ([file, message]) => [file, message] as const),
    ...untagged,
    ...Arr.flatMap(actionFiles, (file: string) =>
      Arr.map(
        checkActionFile(file, project.sourceFile(file), actionsFolder, errorClasses),
        (message) => [file, message] as const,
      ),
    ),
    ...Arr.flatMap(
      Arr.filter(sourceFiles, (file) => !Str.includes("/internal/")(file)),
      (file: string) =>
        Arr.map(brokenLinks(project, file, exported), (message) => [file, message] as const),
    ),
  ];
  const problems = Arr.map(
    located,
    ([file, message]) => `${path.relative(workspace.packageDir, file)}: ${message}`,
  );

  if (problems.length > 0) return yield* CheckFailed.make({ check: "lint-jsdoc", problems });
  return yield* Console.log(
    `lint-jsdoc: ok (${declarations.modules} modules, ${actionFiles.length} action files)`,
  );
}, Effect.scoped);

export const lintJsdocCommand = Command.make("lint-jsdoc", {}, () => lintJsdoc()).pipe(
  Command.withDescription(
    "Check JSDoc and @stability on exports, the action doc format and {@link} targets",
  ),
);
