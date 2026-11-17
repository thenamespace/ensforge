#!/usr/bin/env node
// typedoc 0.28 supports TypeScript up to 6.0, while the repository builds with 7. This package
// holds typedoc with its own TypeScript 6; packages run it from their folder (`typedoc.json`).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const typedoc = join(
  dirname(createRequire(import.meta.url).resolve("typedoc/package.json")),
  "bin/typedoc",
);
const result = spawnSync(process.execPath, [typedoc, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
