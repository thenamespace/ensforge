import { Console, Effect, FileSystem, Path } from "effect";
import { Command } from "effect/cli";

import { CheckFailed } from "../errors.ts";
import { TypeScript } from "../services/TypeScript.ts";
import { Workspace } from "../services/Workspace.ts";

/**
 * Checks the built declarations: those reachable from the `effectFree` entries never import
 * `effect` (Promise users never need its types), and `verify/consumer.ts`, which imports the
 * package by name, compiles against them with `exactOptionalPropertyTypes` on and off.
 */
export const distTypes = Effect.fn("distTypes")(function* () {
  const workspace = yield* Workspace;
  const typescript = yield* TypeScript;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const problems: string[] = [];
  const effectFree = workspace.entriesOf(workspace.config.effectFree);

  for (const entry of effectFree) {
    const seen = new Set<string>();
    const pending = [entry.declaration];
    while (pending.length > 0) {
      const file = pending.pop() ?? "";
      if (seen.has(file) || !(yield* fs.exists(file))) continue;
      seen.add(file);
      const text = yield* fs.readFileString(file);
      for (const [, specifier = ""] of text.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
        if (specifier === "effect" || specifier.startsWith("effect/"))
          problems.push(
            `${entry.name}: ${path.relative(workspace.packageDir, file)} imports "${specifier}"`,
          );
        else if (specifier.startsWith("."))
          pending.push(path.resolve(path.dirname(file), specifier.replace(/\.js$/, ".d.ts")));
      }
    }
  }

  const consumer = path.join(workspace.packageDir, "verify/consumer.ts");
  const hasConsumer = yield* fs.exists(consumer);
  if (hasConsumer) {
    for (const exactOptionalPropertyTypes of [true, false]) {
      const config = yield* typescript.writeConfig(workspace.packageDir, {
        compilerOptions: {
          module: "esnext",
          moduleResolution: "bundler",
          target: "es2022",
          lib: ["es2022", "dom"],
          types: [],
          strict: true,
          exactOptionalPropertyTypes,
          skipLibCheck: true,
          noEmit: true,
        },
        files: [consumer],
      });
      yield* typescript
        .tsc(["-p", config, "--pretty", "false"], { cwd: workspace.packageDir })
        .pipe(
          Effect.catchTag("ToolFailed", ({ output }) =>
            Effect.sync(() =>
              problems.push(
                `consumer (exactOptionalPropertyTypes: ${exactOptionalPropertyTypes}):`,
                output,
              ),
            ),
          ),
        );
    }
  }

  if (problems.length > 0) return yield* new CheckFailed({ check: "dist-types", problems });
  yield* Console.log(
    `dist-types: ok (effect-free: ${effectFree.map((entry) => entry.name).join(", ") || "none"}${hasConsumer ? "; consumer compiles" : ""})`,
  );
});

export const distTypesCommand = Command.make("dist-types", {}, () => distTypes()).pipe(
  Command.withDescription("Check the built declarations and compile the consumer fixture"),
);
