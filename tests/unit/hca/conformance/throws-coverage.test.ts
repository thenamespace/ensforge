import { readdirSync, readFileSync } from "node:fs";

import { assert, describe, it } from "@effect/vitest";

import { Actions } from "@ensforge/hca";

// Every error code an HCA action documents (`@throws … (`CODE`)`) must be asserted by a test that
// names the action. Codes not covered yet are listed below and must shrink, never grow.

const repository = new URL("../../../../", import.meta.url);
const actionsFolder = new URL("packages/hca/src/actions/", repository);
const testFolders = ["tests/unit/hca/", "tests/integration/test/", "tests/services/test/"].map(
  (folder) => new URL(folder, repository),
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

const testSources = testFolders.flatMap((folder) =>
  readdirSync(folder, { recursive: true, encoding: "utf8" })
    // This file names every uncovered code; it does not cover them.
    .filter((file) => file.endsWith(".ts") && !file.endsWith("throws-coverage.test.ts"))
    .map((file) => readFileSync(new URL(file, folder), "utf8")),
);

// One folder per action; its `index.ts` documents the action and its `Sync` variant.
const actions = Object.entries(
  Actions as unknown as Record<string, Record<string, unknown>>,
).flatMap(([domain, group]) =>
  readdirSync(new URL(`${domain}/`, actionsFolder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => ({
      domain,
      name,
      path: `${domain}.${name}`,
      write: (group[name] as { readonly prepare?: unknown }).prepare !== undefined,
    })),
);

const documentedCodes = (domain: string, name: string): readonly string[] => {
  const source = readFileSync(new URL(`${domain}/${name}/index.ts`, actionsFolder), "utf8");
  return [
    ...new Set(
      source
        .split("\n")
        .filter((line) => line.includes("@throws"))
        .flatMap((line) =>
          [...line.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map(([, code]) => code ?? ""),
        ),
    ),
  ];
};

describe("documented HCA errors", () => {
  it("are asserted by a test that names the action", () => {
    const missing: Record<string, string[]> = {};
    for (const { domain, name, path, write } of actions) {
      const files = testSources.filter((source) => source.includes(path));
      for (const code of documentedCodes(domain, name)) {
        if (write && coveredForWrites.has(code)) continue;
        if (files.some((source) => source.includes(`"${code}"`))) continue;
        (missing[path] ??= []).push(code);
      }
    }

    assert.isAbove(actions.length, 20);
    assert.deepStrictEqual(missing, uncovered);
  });
});
