import { Console, Effect, FileSystem, Path } from "effect";
import { Command } from "effect/cli";

import { CheckFailed } from "../errors.ts";
import { actionFilesOf, checkActionFile } from "../lint-jsdoc/actions.ts";
import { undocumentedExports } from "../lint-jsdoc/declarations.ts";
import { brokenLinks, exportedPaths } from "../lint-jsdoc/links.ts";
import { TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";

/**
 * Checks the package's documentation: every export reachable from the API entries has JSDoc,
 * action files follow the Effect-style format, and every `{@link}` resolves.
 */
export const lintJsdoc = Effect.fn("lintJsdoc")(function* () {
  const workspace = yield* Workspace;
  const typescript = yield* TypeScript;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const src = path.join(workspace.packageDir, "src");

  const relativePaths = yield* fs.readDirectory(src, { recursive: true });
  const sourceFiles = relativePaths
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => path.join(src, file));
  const project = yield* typescript.open(sourceFiles);
  const entries = workspace.entriesOf(workspace.config.api).map((entry) => entry.source);

  // The package's own error classes plus the sdk's, which extension packages also throw.
  const errorClasses = new Set<string>();
  for (const folder of [
    path.join(src, "errors/classes"),
    path.join(workspace.root, "packages/sdk/src/errors/classes"),
  ]) {
    if (!(yield* fs.exists(folder))) continue;
    for (const file of yield* fs.readDirectory(folder)) errorClasses.add(file.replace(/\.ts$/, ""));
  }

  const existing = new Set(sourceFiles);
  const declarations = undocumentedExports(project, entries, (file) => existing.has(file));
  const actionsFolder = path.join(src, "actions");
  const actionFiles = actionFilesOf(
    actionsFolder,
    relativePaths.filter((file) => file.startsWith("actions/")).map((file) => file.slice(8)),
  );
  const exported = exportedPaths(
    project,
    workspace.entries.map((entry) => entry.source),
  );

  const problems = [
    ...declarations.problems.map(([file, message]) => [file, message] as const),
    ...actionFiles.flatMap((file) =>
      checkActionFile(file, project.sourceFile(file), actionsFolder, errorClasses).map(
        (message) => [file, message] as const,
      ),
    ),
    ...sourceFiles
      .filter((file) => !file.includes("/internal/"))
      .flatMap((file) =>
        brokenLinks(project, file, exported).map((message) => [file, message] as const),
      ),
  ].map(([file, message]) => `${path.relative(workspace.packageDir, file)}: ${message}`);

  if (problems.length > 0) return yield* new CheckFailed({ check: "lint-jsdoc", problems });
  yield* Console.log(
    `lint-jsdoc: ok (${declarations.modules} modules, ${actionFiles.length} action files)`,
  );
}, Effect.scoped);

export const lintJsdocCommand = Command.make("lint-jsdoc", {}, () => lintJsdoc()).pipe(
  Command.withDescription("Check JSDoc on exports, the action doc format and {@link} targets"),
);
