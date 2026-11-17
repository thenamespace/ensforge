import { Console, Effect, FileSystem, Path } from "effect";
import { Command } from "effect/cli";

import { CheckFailed } from "../errors.ts";
import { examplesOf, toModule } from "../examples/extract.ts";
import { TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";

/**
 * Type-checks every JSDoc example as users would paste it. `verify/example-globals.ts`
 * declares the values examples assume the app already has (`ens`, `publicClient`, …).
 */
export const examples = Effect.fn("examples")(function* () {
  const workspace = yield* Workspace;
  const typescript = yield* TypeScript;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const src = path.join(workspace.packageDir, "src");
  const out = path.join(workspace.packageDir, "node_modules/.cache/examples");
  const globals = path.join(workspace.packageDir, "verify/example-globals.ts");

  yield* fs.remove(out, { recursive: true, force: true });
  yield* fs.makeDirectory(out, { recursive: true });

  let count = 0;
  for (const file of yield* fs.readDirectory(src, { recursive: true })) {
    if (!/\.tsx?$/.test(file)) continue;
    const base = file.replaceAll("/", "__").replace(/\.tsx?$/, "");
    for (const [index, example] of examplesOf(
      yield* fs.readFileString(path.join(src, file)),
    ).entries()) {
      yield* fs.writeFileString(
        path.join(out, `${base}__${index + 1}.${example.extension}`),
        toModule(example.code),
      );
      count += 1;
    }
  }

  yield* fs.writeFileString(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      extends: path.join(workspace.packageDir, "tsconfig.json"),
      compilerOptions: {
        rootDir: workspace.packageDir,
        noEmit: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        allowUnreachableCode: true,
      },
      include: ["./*.ts", "./*.tsx", globals],
    }),
  );

  yield* typescript
    .tsc(["-p", path.join(out, "tsconfig.json"), "--pretty", "false"], {
      cwd: workspace.packageDir,
    })
    .pipe(
      Effect.mapError(
        ({ output }) =>
          new CheckFailed({
            check: "examples",
            problems: [
              ...output.trim().split("\n"),
              `${new Set(output.match(/[\w.-]+__\d+\.tsx?/g) ?? []).size} of ${count} examples fail to type-check`,
            ],
          }),
      ),
    );
  yield* Console.log(`examples: ok (${count} examples)`);
});

export const examplesCommand = Command.make("examples", {}, () => examples()).pipe(
  Command.withDescription("Type-check every JSDoc example"),
);
