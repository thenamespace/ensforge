import { gzipSync } from "node:zlib";

import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Path,
  Record as Rec,
  String as Str,
} from "effect";
import { Command, Flag } from "effect/cli";

import { build } from "rolldown";

import { overBudget, readBudgets, writeBudgets } from "../budgets.ts";
import { CheckFailed, ToolFailed } from "../errors.ts";
import { Workspace } from "../services/Workspace.ts";

/** Which chunks a scenario counts: what an app loads up front, or what it loads on demand. */
export type Scope = "initial" | "lazy";

const ensClient =
  'import { Ensforge, ensActions } from "@ensforge/sdk"; export const make = (publicClient) => Ensforge.create({ publicClient }).extend(ensActions());';

// What typical apps import, bundled from the package that would install them (built `dist`,
// published exports). viem and React are external: apps already ship them.
export const scenarios: Readonly<
  Record<string, readonly [pkg: string, source: string, scope?: Scope]>
> = {
  "sdk: Actions.record.getText": [
    "sdk",
    'import { Actions } from "@ensforge/sdk"; export const read = Actions.record.getText;',
  ],
  "sdk: Actions.record.set": [
    "sdk",
    'import { Actions } from "@ensforge/sdk"; export const write = Actions.record.set;',
  ],
  "sdk: record, name and primaryName actions": [
    "sdk",
    'import { Ensforge, nameActions, primaryNameActions, recordActions } from "@ensforge/sdk"; export const make = (publicClient) => Ensforge.create({ publicClient }).extend(recordActions()).extend(nameActions()).extend(primaryNameActions());',
  ],
  "sdk: ensActions()": ["sdk", ensClient],
  "sdk: ensActions(), loaded on demand": ["sdk", ensClient, "lazy"],
  "sdk: ensActions() + indexerActions()": [
    "sdk",
    'import { Ensforge, ensActions } from "@ensforge/sdk"; import { bigname, indexerActions } from "@ensforge/sdk/indexer"; export const make = (publicClient) => Ensforge.create({ publicClient, indexer: bigname() }).extend(ensActions()).extend(indexerActions());',
  ],
  "sdk/effect: Actions.record.get": [
    "sdk",
    'import { Actions } from "@ensforge/sdk/effect"; export const read = Actions.record.get;',
  ],
  "react: useAddress": ["react", 'export { EnsforgeProvider, useAddress } from "@ensforge/react";'],
  "react: useName": ["react", 'export { EnsforgeProvider, useName } from "@ensforge/react";'],
  "hca: hca() with owner()": ["hca", 'export { hca, owner } from "@ensforge/hca";'],
};

/**
 * Gzipped bytes an app loads up front (the entry and its static imports), or on demand (every
 * other chunk). Imports resolve from `folder`, as they would in an app there.
 */
export const measure = Effect.fn("bundleSize.measure")(function* (
  folder: string,
  source: string,
  scope: Scope = "initial",
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.remove(folder, { recursive: true, force: true });
  yield* fs.makeDirectory(folder, { recursive: true });
  yield* fs.writeFileString(path.join(folder, "entry.mjs"), source);

  const result = yield* Effect.tryPromise({
    try: () =>
      build({
        input: path.join(folder, "entry.mjs"),
        external: (id) =>
          id === "viem" ||
          Str.startsWith("viem/")(id) ||
          id === "react" ||
          Str.startsWith("react/")(id) ||
          id === "react-dom",
        output: { format: "esm", minify: true },
        write: false,
        logLevel: "silent",
      }),
    catch: (cause) => ToolFailed.make({ tool: "rolldown", output: String(cause) }),
  });

  const chunks = new Map(Arr.map(result.output, (chunk) => [chunk.fileName, chunk]));
  const initial = new Set<string>();
  const visit = (fileName: string) => {
    const chunk = chunks.get(fileName);
    if (chunk === undefined || initial.has(fileName)) return;
    initial.add(fileName);
    if (chunk.type === "chunk") for (const imported of chunk.imports) visit(imported);
  };
  for (const chunk of result.output)
    if (chunk.type === "chunk" && chunk.isEntry) visit(chunk.fileName);

  const counted = Arr.filter(
    [...chunks.keys()],
    (fileName) => initial.has(fileName) === (scope === "initial"),
  );
  const code = Arr.join(
    Arr.map(counted, (fileName) => {
      const chunk = chunks.get(fileName);
      return chunk?.type === "chunk" ? chunk.code : "";
    }),
    "",
  );
  return gzipSync(code).length;
});

/**
 * Bundles each scenario and compares its up-front gzipped size with
 * `.config/bundle-budgets.json` (5% growth allowed); `write` records the current sizes instead.
 */
export const bundleSize = Effect.fn("bundleSize")(function* (write: boolean) {
  const workspace = yield* Workspace;
  const path = yield* Path.Path;
  const budgets = write ? {} : yield* readBudgets(workspace.root, "bundle-budgets.json");

  const sizes = yield* Effect.forEach(
    Rec.toEntries(scenarios),
    ([name, [pkg, source, scope]], index) =>
      measure(
        path.join(workspace.root, "packages", pkg, `node_modules/.cache/bundle-size/${index}`),
        source,
        scope,
      ).pipe(Effect.map((size) => [name, size] as const)),
    { concurrency: "unbounded" },
  );

  for (const [name, size] of sizes)
    yield* Console.log(`${Str.padStart(8)(String(size))} B  ${name}`);
  if (write) {
    yield* writeBudgets(workspace.root, "bundle-budgets.json", sizes);
    return yield* Console.log("bundle-size: budgets written");
  }

  const problems = overBudget(sizes, budgets, "B gzip");
  if (problems.length > 0) return yield* CheckFailed.make({ check: "bundle-size", problems });
  return yield* Console.log("bundle-size: ok");
});

export const bundleSizeCommand = Command.make(
  "bundle-size",
  {
    write: Flag.Boolean("write").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Record the current sizes as budgets"),
    ),
  },
  ({ write }) => bundleSize(write),
).pipe(Command.withDescription("Check bundle sizes of typical imports against the budgets"));
