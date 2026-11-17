// Checks the published type declarations of a package.
//
//   node ../../scripts/check-dist-types.mjs --effect-free <entry>... [--consumer <file.ts>]
//
// 1. No declaration reachable from an --effect-free entry (dist/<entry>.d.ts) imports `effect`,
//    so Promise users never need Effect's types.
// 2. The --consumer file, which imports the package by name, compiles against the built
//    declarations with `exactOptionalPropertyTypes` both on and off.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { runTsc } from "./lib/typescript.mjs";

const args = process.argv.slice(2);
const consumerIndex = args.indexOf("--consumer");
const consumer = consumerIndex === -1 ? undefined : args[consumerIndex + 1];
const effectFree = args.filter(
  (arg, index) => !arg.startsWith("--") && (consumerIndex === -1 || index !== consumerIndex + 1),
);
const packageFolder = process.cwd();
const problems = [];

const importsOf = (file) =>
  [...readFileSync(file, "utf8").matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );

for (const entry of effectFree) {
  const seen = new Set();
  const flat = join(packageFolder, "dist", `${entry}.d.ts`);
  const pending = [existsSync(flat) ? flat : join(packageFolder, "dist", entry, "index.d.ts")];

  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);

    for (const specifier of importsOf(file)) {
      if (specifier === "effect" || specifier.startsWith("effect/")) {
        problems.push(`${entry}: ${relative(packageFolder, file)} imports "${specifier}"`);
      } else if (specifier.startsWith(".")) {
        pending.push(resolve(dirname(file), specifier.replace(/\.js$/, ".d.ts")));
      }
    }
  }
}

if (consumer !== undefined) {
  const folder = join(packageFolder, "node_modules/.cache/check-dist-types");
  mkdirSync(folder, { recursive: true });

  for (const exactOptionalPropertyTypes of [true, false]) {
    const config = join(folder, `tsconfig.${exactOptionalPropertyTypes}.json`);
    writeFileSync(
      config,
      JSON.stringify({
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
        files: [join(packageFolder, consumer)],
      }),
    );
    const result = runTsc(["-p", config, "--pretty", "false"], { cwd: packageFolder });
    if (result.status !== 0) {
      problems.push(
        `consumer (exactOptionalPropertyTypes: ${exactOptionalPropertyTypes}):\n${result.output}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `check-dist-types: ok (effect-free: ${effectFree.join(", ") || "none"}${consumer ? "; consumer compiles" : ""})`,
);
