// Measures what typical imports add to an app bundle, and fails above the recorded budgets.
//
//   node scripts/bundle-size.mjs           check against scripts/bundle-budgets.json
//   node scripts/bundle-size.mjs --write   record the current sizes as budgets
//
// Each scenario is bundled from the package it imports (built `dist`, published exports), minified,
// with viem external: apps already ship it. Sizes are gzipped bytes. Budgets allow 5% growth.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const { build } = await import("rolldown");

const scenarios = {
  "sdk: Actions.record.getText": [
    "sdk",
    'import { Actions } from "@ensforge/sdk"; export const read = Actions.record.getText;',
  ],
  "sdk: ensActions()": [
    "sdk",
    'import { Ensforge, ensActions } from "@ensforge/sdk"; export const make = (publicClient) => Ensforge.create({ publicClient }).extend(ensActions());',
  ],
  "sdk: ensActions() + indexerActions()": [
    "sdk",
    'import { Ensforge, ensActions } from "@ensforge/sdk"; import { bigname, indexerActions } from "@ensforge/sdk/indexer"; export const make = (publicClient) => Ensforge.create({ publicClient, indexer: bigname() }).extend(ensActions()).extend(indexerActions());',
  ],
  "react: useAddress": ["react", 'export { EnsforgeProvider, useAddress } from "@ensforge/react";'],
  "hca: hca() with owner()": ["hca", 'export { hca, owner } from "@ensforge/hca";'],
};

const budgetsFile = join(root, "scripts/bundle-budgets.json");
const write = process.argv.includes("--write");
const budgets = write ? {} : JSON.parse(readFileSync(budgetsFile, "utf8"));
const sizes = {};
const problems = [];

const measure = async ([name, [pkg, source]]) => {
  // Each scenario bundles from its own folder, so the runs can go in parallel.
  const folder = join(
    root,
    "packages",
    pkg,
    "node_modules/.cache/bundle-size",
    String(name.length) + name.replaceAll(/\W/g, ""),
  );
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "entry.mjs"), source);

  const result = await build({
    input: join(folder, "entry.mjs"),
    external: (id) =>
      id === "viem" ||
      id.startsWith("viem/") ||
      id === "react" ||
      id.startsWith("react/") ||
      id === "react-dom",
    output: { format: "esm", minify: true },
    write: false,
    logLevel: "silent",
  });
  return [name, gzipSync(result.output.map((chunk) => chunk.code ?? "").join("")).length];
};

for (const [name, size] of await Promise.all(Object.entries(scenarios).map(measure))) {
  sizes[name] = size;
  const budget = budgets[name];
  if (!write && (budget === undefined || size > budget * 1.05)) {
    problems.push(`${name}: ${size} B gzip (budget ${budget ?? "none"} B)`);
  }
}

for (const [name, size] of Object.entries(sizes))
  console.log(`${String(size).padStart(8)} B  ${name}`);
if (write) {
  writeFileSync(budgetsFile, `${JSON.stringify(sizes, null, 2)}\n`);
  console.log("bundle-size: budgets written");
} else if (problems.length > 0) {
  console.error(`bundle-size: over budget\n${problems.join("\n")}`);
  process.exit(1);
} else console.log("bundle-size: ok");
