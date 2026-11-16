// Generates the action barrels, the `Actions` trees (Promise and Effect) and the decorators from
// `src/actions/<domain>/<action>/{index,effect}.ts`.
//
//   node scripts/codegen/main.ts          write the generated files
//   node scripts/codegen/main.ts --check  fail when generated files are stale or the trees disagree
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { discover } from "./discover.ts";
import { decorators, domainBarrel, effectBarrel, treeBarrel } from "./render.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const check = process.argv.includes("--check");

const { domains, problems } = discover(join(root, "src/actions"));
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const outputs = new Map<string, string>([
  ["src/actions/index.ts", treeBarrel(domains, "index")],
  ["src/actions/effect.ts", treeBarrel(domains, "effect")],
  ["src/actions/decorators.ts", decorators(domains)],
  ...domains.flatMap((entry): [string, string][] => [
    [`src/actions/${entry.domain}/index.ts`, domainBarrel(entry)],
    [`src/actions/${entry.domain}/effect.ts`, effectBarrel(entry)],
  ]),
]);

// Format in a scratch copy so --check compares formatted output without touching src.
const stage = check ? join(root, ".codegen-check") : root;
for (const [file, text] of outputs) {
  mkdirSync(dirname(join(stage, file)), { recursive: true });
  writeFileSync(join(stage, file), text);
}
execFileSync("pnpm", ["exec", "oxfmt", ...[...outputs.keys()].map((file) => join(stage, file))], {
  cwd: root,
  stdio: "ignore",
});

if (!check) {
  console.log(`codegen: wrote ${outputs.size} files`);
  process.exit(0);
}

const stale = [...outputs.keys()].filter((file) => {
  const current = join(root, file);
  return (
    !existsSync(current) ||
    readFileSync(current, "utf8") !== readFileSync(join(stage, file), "utf8")
  );
});
rmSync(stage, { recursive: true, force: true });

if (stale.length > 0) {
  console.error(`Generated files are stale; run \`pnpm codegen\`:\n${stale.join("\n")}`);
  process.exit(1);
}
console.log(
  `codegen: ok (${domains.length} domains, ${domains.flatMap((d) => d.actions).length} actions)`,
);
