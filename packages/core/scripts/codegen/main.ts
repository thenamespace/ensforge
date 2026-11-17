// Generates the action barrels, the `Actions` trees (Promise and Effect) and the decorators from
// `src/actions/<domain>/<action>/{index,effect}.ts`.
//
//   node scripts/codegen/main.ts                    write the generated files (core)
//   node scripts/codegen/main.ts --check            fail when generated files are stale
//   node scripts/codegen/main.ts --root ../hca      run for an extension package
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { discover } from "./discover.ts";
import {
  coreProfile,
  decorators,
  domainBarrel,
  effectBarrel,
  extensionProfile,
  requestsTable,
  treeBarrel,
} from "./render.ts";

const rootFlag = process.argv.indexOf("--root");
const root =
  rootFlag === -1
    ? join(dirname(fileURLToPath(import.meta.url)), "../..")
    : resolve(process.argv[rootFlag + 1] as string);
const check = process.argv.includes("--check");
const profile =
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name === "@ensforge/core"
    ? coreProfile
    : extensionProfile;

const { domains, problems } = discover(join(root, "src/actions"));
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const outputs = new Map<string, string>([
  ["src/actions/index.ts", treeBarrel(domains, "index", profile)],
  ["src/actions/effect.ts", treeBarrel(domains, "effect", profile)],
  ["src/actions/decorators.ts", decorators(domains, profile)],
  ...(profile.batch
    ? [["src/actions/requests.ts", requestsTable(domains)] as [string, string]]
    : []),
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
