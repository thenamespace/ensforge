// Builds a package's dist with tsc: one ES module and declaration per source file.
//
//   node ../../scripts/build-package.mjs [--watch]
//
// tsc keeps `export * as X from` re-exports, which app bundlers tree-shake; tsdown's unbundled
// output turned them into runtime namespace objects that keep every member.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
if (!watch) rmSync("dist", { recursive: true, force: true });

const result = spawnSync("tsc", ["-p", "tsconfig.build.json", ...(watch ? ["--watch"] : [])], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
