/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string -- synchronous text scanning of Markdown, where native string and array methods read more directly than curried Effect ones */
import { Console, Effect, FileSystem, Formatter, Option, Path, String as Str } from "effect";
import { Command } from "effect/cli";

import { blocksOf, moduleOf } from "../docs/codeBlocks.ts";
import { readPages } from "../docs/content.ts";
import { CheckFailed } from "../errors.ts";
import { TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";

/**
 * Type-checks the ```ts and ```tsx blocks of the hand-written docs pages against the built
 * workspace packages (build them first, as for `ensforge-dev examples`). Generated pages are
 * skipped: their examples are JSDoc, which `examples` checks. Run it from `apps/docs`.
 *
 * Twoslash notation is understood: `// ^?` lines and `// @flag` directives are dropped,
 * `// ---cut---` is just a separator (everything compiles) and `// @filename: x` splits a block
 * into files. Opt a block out with a `no-check` (or `noCheck`) word in its meta, e.g.
 * ```` ```ts no-check title="Before" ````, or a `// @noErrors` line.
 */
export const docsExamples = Effect.fn("docs.examples")(function* () {
  const workspace = yield* Workspace;
  const typescript = yield* TypeScript;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const out = path.join(workspace.packageDir, "node_modules/.cache/doc-examples");
  // The values JSDoc examples assume (`ens`, `publicClient`, ...) are free in docs snippets too.
  const globals = path.join(workspace.root, "packages/sdk/verify/example-globals.ts");

  yield* fs.remove(out, { recursive: true, force: true });
  yield* fs.makeDirectory(out, { recursive: true });

  // Output file -> where the block starts, to point diagnostics back at the page.
  const origins = new Map<string, string>();
  let count = 0;
  for (const page of yield* readPages(workspace.root)) {
    if (page.generated) continue;
    const base = Str.replaceAll(/[^\w]+/g, "_")(Str.replace(/\.mdx$/, "")(page.file));
    for (const block of blocksOf(page.body)) {
      count += 1;
      const folder = path.join(out, `${base}__L${block.line}`);
      yield* fs.makeDirectory(folder, { recursive: true });
      for (const file of block.files) {
        const name = block.files.length === 1 ? `block.${block.extension}` : file.name;
        const target = path.join(folder, name);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(target, moduleOf(file.code, block.files.length > 1));
        origins.set(`${base}__L${block.line}/`, `${page.file}:${block.line}`);
      }
    }
  }

  yield* fs.writeFileString(
    path.join(out, "tsconfig.json"),
    Formatter.formatJson({
      extends: path.join(workspace.packageDir, "tsconfig.json"),
      compilerOptions: {
        rootDir: workspace.root,
        noEmit: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        allowUnreachableCode: true,
        paths: {},
      },
      include: ["./**/*.ts", "./**/*.tsx", globals],
    }),
  );

  yield* typescript
    .tsc(["-p", path.join(out, "tsconfig.json"), "--pretty", "false"], {
      cwd: workspace.packageDir,
    })
    .pipe(
      Effect.mapError(({ output }) => {
        const failing = new Set(
          Option.getOrElse(Str.match(/doc-examples\/([\w]+__L\d+)\//g)(output), () => []),
        );
        const where = [...failing].map((match) => {
          const key = Str.replace(/^doc-examples\//, "")(match);
          return origins.get(key) ?? key;
        });
        return CheckFailed.make({
          check: "docs-examples",
          problems: [
            ...Str.split(Str.trim(output), "\n"),
            ...where.map((origin) => `fails: ${origin}`),
            `${failing.size} of ${count} docs code blocks fail to type-check`,
          ],
        });
      }),
    );
  yield* Console.log(`docs examples: ok (${count} blocks)`);
});

export const docsExamplesCommand = Command.make("examples", {}, () => docsExamples()).pipe(
  Command.withDescription(
    "Type-check the ts/tsx blocks of hand-written docs pages (opt out with `no-check` in the fence meta)",
  ),
);
