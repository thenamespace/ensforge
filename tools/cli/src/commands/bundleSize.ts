import { gzipSync } from "node:zlib";

import { Console, Effect, FileSystem, Path, Schema } from "effect";
import { Command, Flag } from "effect/cli";

import { build } from "rolldown";

import { CheckFailed, SetupError, ToolFailed } from "../errors.ts";
import { Workspace } from "../services/Workspace.ts";

// What typical apps import, bundled from the package that would install them (built `dist`,
// published exports). viem and React are external: apps already ship them.
const scenarios: Readonly<Record<string, readonly [pkg: string, source: string]>> = {
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

const Budgets = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Finite));
const isExternal = (id: string) =>
  id === "viem" ||
  id.startsWith("viem/") ||
  id === "react" ||
  id.startsWith("react/") ||
  id === "react-dom";

/** Gzipped bytes an app loads up front: the entry and its static imports, not lazy chunks. */
const measure = Effect.fn("bundleSize.measure")(function* (folder: string, source: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.remove(folder, { recursive: true, force: true });
  yield* fs.makeDirectory(folder, { recursive: true });
  yield* fs.writeFileString(path.join(folder, "entry.mjs"), source);

  const result = yield* Effect.tryPromise({
    try: () =>
      build({
        input: path.join(folder, "entry.mjs"),
        external: isExternal,
        output: { format: "esm", minify: true },
        write: false,
        logLevel: "silent",
      }),
    catch: (cause) => new ToolFailed({ tool: "rolldown", output: String(cause) }),
  });

  const chunks = new Map(result.output.map((chunk) => [chunk.fileName, chunk]));
  const initial = new Set<string>();
  const visit = (fileName: string) => {
    const chunk = chunks.get(fileName);
    if (chunk === undefined || initial.has(fileName)) return;
    initial.add(fileName);
    if (chunk.type === "chunk") for (const imported of chunk.imports) visit(imported);
  };
  for (const chunk of result.output)
    if (chunk.type === "chunk" && chunk.isEntry) visit(chunk.fileName);

  const code = [...initial]
    .map((fileName) => {
      const chunk = chunks.get(fileName);
      return chunk?.type === "chunk" ? chunk.code : "";
    })
    .join("");
  return gzipSync(code).length;
});

/**
 * Bundles each scenario and compares its up-front gzipped size with
 * `.config/bundle-budgets.json` (5% growth allowed); `write` records the current sizes instead.
 */
export const bundleSize = Effect.fn("bundleSize")(function* (write: boolean) {
  const workspace = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const budgetsFile = path.join(workspace.root, ".config/bundle-budgets.json");
  const budgets = write
    ? {}
    : yield* fs.readFileString(budgetsFile).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Budgets)),
        Effect.mapError((cause) => new SetupError({ message: `${budgetsFile}: ${String(cause)}` })),
      );

  const sizes = yield* Effect.forEach(
    Object.entries(scenarios),
    ([name, [pkg, source]], index) =>
      measure(
        path.join(workspace.root, "packages", pkg, `node_modules/.cache/bundle-size/${index}`),
        source,
      ).pipe(Effect.map((size) => [name, size] as const)),
    { concurrency: "unbounded" },
  );

  for (const [name, size] of sizes) yield* Console.log(`${String(size).padStart(8)} B  ${name}`);
  if (write) {
    yield* fs.writeFileString(
      budgetsFile,
      `${JSON.stringify(Object.fromEntries(sizes), null, 2)}\n`,
    );
    return yield* Console.log("bundle-size: budgets written");
  }

  const problems = sizes.flatMap(([name, size]) => {
    const budget = budgets[name];
    return budget === undefined || size > budget * 1.05
      ? [`${name}: ${size} B gzip (budget ${budget ?? "none"} B)`]
      : [];
  });
  if (problems.length > 0) return yield* new CheckFailed({ check: "bundle-size", problems });
  yield* Console.log("bundle-size: ok");
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
