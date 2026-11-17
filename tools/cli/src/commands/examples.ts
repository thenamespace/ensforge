import { Console, Effect, FileSystem, Path } from "effect";
import { Command } from "effect/cli";

import { CheckFailed } from "../errors.ts";
import { TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";

type Example = { readonly code: string; readonly extension: "ts" | "tsx" };

/** The ```ts and ```tsx fences of every doc comment in `text`. */
const examplesOf = (text: string): Example[] => {
  const examples: Example[] = [];
  for (const comment of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    const lines = comment[0].split("\n").map((line) => line.replace(/^\s*\*( |$)/, ""));
    let fence: string[] | undefined;
    let extension: Example["extension"] = "ts";
    for (const line of lines) {
      const trimmed = line.trim();
      if (fence === undefined && (trimmed === "```ts" || trimmed === "```tsx")) {
        fence = [];
        extension = trimmed === "```tsx" ? "tsx" : "ts";
      } else if (fence !== undefined && trimmed === "```") {
        examples.push({ code: fence.join("\n"), extension });
        fence = undefined;
      } else fence?.push(line);
    }
  }
  return examples;
};

// Imports (possibly spanning lines) move to module scope; the rest runs in an async generator,
// so both `await` and Effect's `yield*` type-check.
const toModule = (example: string): string => {
  const imports: string[] = [];
  const body: string[] = [];
  let open = false;
  for (const line of example.split("\n")) {
    if (open || /^import\s/.test(line)) {
      imports.push(line);
      open = !/from\s+["'][^"']+["'];?\s*$/.test(line) && !/^import\s+["']/.test(line);
    } else body.push(line.replace(/^export (default )?(?=(async )?function|const|class)/, ""));
  }
  return `${imports.join("\n")}\n\nexport async function* example() {\n${body.join("\n")}\n}\n`;
};

/**
 * Type-checks every JSDoc example as users would paste it. `test/fixtures/example-globals.ts`
 * declares the values examples assume the app already has (`ens`, `publicClient`, …).
 */
export const examples = Effect.fn("examples")(function* () {
  const workspace = yield* Workspace;
  const typescript = yield* TypeScript;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const src = path.join(workspace.packageDir, "src");
  const out = path.join(workspace.packageDir, "node_modules/.cache/examples");
  const globals = path.join(workspace.packageDir, "test/fixtures/example-globals.ts");

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
      Effect.catchTag("ToolFailed", ({ output }) =>
        Effect.fail(
          new CheckFailed({
            check: "examples",
            problems: [
              ...output.trim().split("\n"),
              `${new Set(output.match(/[\w.-]+__\d+\.tsx?/g) ?? []).size} of ${count} examples fail to type-check`,
            ],
          }),
        ),
      ),
    );
  yield* Console.log(`examples: ok (${count} examples)`);
});

export const examplesCommand = Command.make("examples", {}, () => examples()).pipe(
  Command.withDescription("Type-check every JSDoc example"),
);
