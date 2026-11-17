// Type-checks every ```ts and ```tsx example in a package's JSDoc, as users would paste it.
//
//   node ../../scripts/check-examples.mjs <globals.ts>
//
// Run from a package folder. Each example becomes a module under node_modules/.cache/examples:
// its imports stay at the top and the rest runs inside an async generator, so both `await` and
// Effect's `yield*` type-check. `<globals.ts>` declares the free identifiers examples share
// (`ens`, `publicClient`, …).
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const [globalsArgument] = process.argv.slice(2);
if (globalsArgument === undefined) {
  console.error("usage: check-examples.mjs <globals.ts>");
  process.exit(2);
}

const packageFolder = process.cwd();
const globals = resolve(globalsArgument);
const outFolder = join(packageFolder, "node_modules/.cache/examples");

const sourceFiles = (folder) =>
  readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) return entry === "legacy" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });

const examplesOf = (text) => {
  const examples = [];
  for (const comment of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    const lines = comment[0].split("\n").map((line) => line.replace(/^\s*\*( |$)/, ""));
    let fence;
    let extension = "ts";
    for (const line of lines) {
      if (fence === undefined && (line.trim() === "```ts" || line.trim() === "```tsx")) {
        fence = [];
        extension = line.trim() === "```tsx" ? "tsx" : "ts";
      } else if (fence !== undefined && line.trim() === "```") {
        examples.push({ code: fence.join("\n"), extension });
        fence = undefined;
      } else fence?.push(line);
    }
  }
  return examples;
};

// Imports (possibly spanning lines) move to module scope; everything else is the body.
const toModule = (example) => {
  const imports = [];
  const body = [];
  let open = false;
  for (const line of example.split("\n")) {
    if (open || /^import\s/.test(line)) {
      imports.push(line);
      open = !/from\s+["'][^"']+["'];?\s*$/.test(line) && !/^import\s+["']/.test(line);
    } else body.push(line.replace(/^export (default )?(?=(async )?function|const|class)/, ""));
  }
  return `${imports.join("\n")}\n\nexport async function* example() {\n${body.join("\n")}\n}\n`;
};

rmSync(outFolder, { recursive: true, force: true });
mkdirSync(outFolder, { recursive: true });

const origins = new Map();
for (const file of sourceFiles(join(packageFolder, "src"))) {
  examplesOf(readFileSync(file, "utf8")).forEach((example, index) => {
    const base = relative(join(packageFolder, "src"), file)
      .replaceAll("/", "__")
      .replace(/\.tsx?$/, "");
    const name = `${base}__${index + 1}.${example.extension}`;
    writeFileSync(join(outFolder, name), toModule(example.code));
    origins.set(name, relative(packageFolder, file));
  });
}

writeFileSync(
  join(outFolder, "tsconfig.json"),
  JSON.stringify({
    extends: join(packageFolder, "tsconfig.json"),
    compilerOptions: {
      rootDir: packageFolder,
      noEmit: true,
      noUnusedLocals: false,
      noUnusedParameters: false,
      allowUnreachableCode: true,
    },
    include: ["./*.ts", "./*.tsx", globals],
  }),
);

try {
  execFileSync("npx", ["tsc", "-p", join(outFolder, "tsconfig.json"), "--pretty", "false"], {
    cwd: packageFolder,
    stdio: "pipe",
  });
  console.log(`examples: ok (${origins.size} examples)`);
} catch (error) {
  const output = String(error.stdout);
  const failing = new Set(output.match(/[\w.-]+__\d+\.tsx?/g) ?? []);
  console.error(output);
  console.error(`examples: ${failing.size} of ${origins.size} examples fail to type-check`);
  process.exit(1);
}
