import { Array as Arr, Console, Effect, FileSystem, Path, String as Str } from "effect";
import { Command } from "effect/cli";

import { docsSite } from "../docs/site.ts";
import { CheckFailed } from "../errors.ts";
import { Workspace } from "../services/Workspace.ts";
import { docsExamplesCommand } from "./docsExamples.ts";
import { docsLintCommand } from "./docsLint.ts";

/** Folders under `apps/docs` the generator owns: generated pages there are replaced. */
const ownedFolders = ["content/docs/reference"];

/**
 * Writes the generated reference under `apps/docs/content/docs/reference` (and the data of its
 * landing page); with `check`, regenerates in memory and fails when a committed file differs or
 * a generated page no longer has a source. Hand-written pages in the same folders (without
 * `generated: true`) are never touched. oxfmt skips the generated files (`.config/oxfmtignore`):
 * it would reformat the JSDoc examples.
 */
export const docs = Effect.fn("docs")(function* (check: boolean) {
  const workspace = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const content = path.join(workspace.root, "apps/docs");

  const pages = yield* docsSite(workspace.root);

  const existing: string[] = [];
  for (const folder of ownedFolders) {
    const absolute = path.join(content, folder);
    if (!(yield* fs.exists(absolute))) continue;
    for (const file of yield* fs.readDirectory(absolute, { recursive: true })) {
      if (!Str.endsWith(".mdx")(file)) continue;
      const text = yield* fs.readFileString(path.join(absolute, file));
      if (/^generated: true$/m.test(Str.split(text, "\n---")[0] ?? ""))
        existing.push(path.join(folder, file));
    }
  }
  const orphans = Arr.filter(existing, (file) => !pages.has(file));

  if (!check) {
    for (const [file, text] of pages) {
      yield* fs.makeDirectory(path.dirname(path.join(content, file)), { recursive: true });
      yield* fs.writeFileString(path.join(content, file), text);
    }
    for (const file of orphans) yield* fs.remove(path.join(content, file));
    return yield* Console.log(`docs: wrote ${pages.size} files, removed ${orphans.length}`);
  }

  const stale: string[] = [];
  for (const [file, text] of pages) {
    const current = yield* fs
      .readFileString(path.join(content, file))
      .pipe(Effect.orElseSucceed(() => ""));
    if (current !== text) stale.push(file);
  }
  const problems = [...stale, ...Arr.map(orphans, (file) => `${file} (no longer generated)`)];
  if (problems.length > 0) {
    return yield* CheckFailed.make({
      check: "docs",
      problems: [...problems, "The generated reference is stale; run `pnpm docs:generate`."],
    });
  }
  return yield* Console.log(`docs: ok (${pages.size} files)`);
});

const generateCommand = Command.make("generate", {}, () => docs(false)).pipe(
  Command.withDescription("Write the generated API reference into apps/docs"),
);

const checkCommand = Command.make("check", {}, () => docs(true)).pipe(
  Command.withDescription("Fail when the generated API reference in apps/docs is stale"),
);

export const docsCommand = Command.make("docs").pipe(
  Command.withDescription("Generate or check the API reference pages of the docs site"),
  Command.withSubcommands([generateCommand, checkCommand, docsExamplesCommand, docsLintCommand]),
);
