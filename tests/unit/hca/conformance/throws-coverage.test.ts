import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Predicate, Record as Rec, String as Str } from "effect";

import { Actions } from "@ensforge/hca";

// Every error code an HCA action documents (`@throws … (`CODE`)`) must be asserted by a test that
// names the action. Codes not covered yet are listed below and must shrink, never grow.

const repository = new URL("../../../../", import.meta.url);
const actionsFolder = fileURLToPath(new URL("packages/hca/src/actions/", repository));
const testFolders = Arr.map(
  ["tests/unit/hca/", "tests/integration/test/", "tests/services/test/"],
  (folder) => fileURLToPath(new URL(folder, repository)),
);

// Every HCA write signs and confirms through the SDK's runner: `writes/hca.test.ts` reverts and
// times out a sent `hca.executeSync`, as the SDK's `writes/errors.test.ts` does for its writes.
const coveredForWrites = new Set(["TRANSACTION_REVERTED", "RECEIPT_TIMEOUT"]);

/**
 * Documented codes of each action without a test yet: `domain.action` → codes. Codes only
 * Rhinestone's orchestrator can raise for a standalone HCA are blocked upstream (KL-52); list them
 * here with that reason.
 */
const uncovered: Readonly<Record<string, readonly string[]>> = {};

const testSources = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const sources = yield* Effect.forEach(
    testFolders,
    (folder) =>
      Effect.gen(function* () {
        const files = yield* fs.readDirectory(folder, { recursive: true });
        // This file names every uncovered code; it does not cover them.
        const tests = Arr.filter(
          files,
          (file) => Str.endsWith(".ts")(file) && !Str.endsWith("throws-coverage.test.ts")(file),
        );
        return yield* Effect.forEach(tests, (file) => fs.readFileString(`${folder}${file}`), {
          concurrency: 1,
        });
      }),
    { concurrency: 1 },
  );

  return Arr.flatten(sources);
});

const documentedCodes = Effect.fn("documentedCodes")(function* (domain: string, name: string) {
  const fs = yield* FileSystem.FileSystem;
  const source = yield* fs.readFileString(`${actionsFolder}${domain}/${name}/index.ts`);
  const throwsLines = Arr.filter(Str.split("\n")(source), Str.includes("@throws"));

  return [
    ...new Set(
      Arr.flatMap(throwsLines, (line) =>
        Arr.map([...Str.matchAll(/`([A-Z][A-Z0-9_]+)`/g)(line)], ([, code]) => code ?? ""),
      ),
    ),
  ];
});

// One folder per action; its `index.ts` documents the action and its `Sync` variant.
const actions = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const domains = Arr.filter(Rec.toEntries(Actions), ([, group]) => Predicate.isObject(group));

  return yield* Effect.forEach(
    domains,
    ([domain, group]) =>
      Effect.gen(function* () {
        const entries = yield* fs.readDirectory(`${actionsFolder}${domain}`);
        const folders = yield* Effect.filter(
          entries,
          (entry) =>
            Effect.map(
              fs.stat(`${actionsFolder}${domain}/${entry}`),
              (info) => info.type === "Directory",
            ),
          { concurrency: 1 },
        );

        return Arr.map(folders, (name) => ({
          domain,
          name,
          path: `${domain}.${name}`,
          write: Predicate.hasProperty(Reflect.get(Object(group), name), "prepare"),
        }));
      }),
    { concurrency: 1 },
  );
});

layer(NodeServices.layer)("documented HCA errors", (it) => {
  it.effect("are asserted by a test that names the action", () =>
    Effect.gen(function* () {
      const sources = yield* testSources;
      const actionsByDomain = yield* actions;
      const allActions = Arr.flatten(actionsByDomain);
      const missing: Record<string, string[]> = {};
      for (const { domain, name, path, write } of allActions) {
        const files = Arr.filter(sources, Str.includes(path));
        for (const code of yield* documentedCodes(domain, name)) {
          if (write && coveredForWrites.has(code)) continue;
          if (Arr.some(files, Str.includes(`"${code}"`))) continue;
          (missing[path] ??= []).push(code);
        }
      }

      assert.isAbove(allActions.length, 20);
      assert.deepStrictEqual(missing, uncovered);
    }),
  );
});
