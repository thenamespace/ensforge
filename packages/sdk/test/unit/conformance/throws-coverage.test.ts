import { readdirSync, readFileSync } from "node:fs";

import { assert, describe, it } from "@effect/vitest";

import { Actions } from "@ensforge/sdk";

// Every error code an action documents (`@throws … (`CODE`)`) must be asserted by a test that
// names the action. Codes not covered yet are listed below and must shrink, never grow.

const repository = new URL("../../../../../", import.meta.url);
const actionsFolder = new URL("packages/sdk/src/actions/", repository);
const testFolders = ["packages/sdk/test/unit/", "tests/integration/test/"].map(
  (folder) => new URL(folder, repository),
);

// `conformance/invalid-name.test.ts` asserts these for every action generically.
const coveredEverywhere = new Set(["INVALID_NAME"]);

// Every write signs and sends through one runner: `writes/conformance.test.ts` sends each write
// without a wallet, and `writes/errors.test.ts` reverts and times out a sent one.
const coveredForWrites = new Set([
  "WALLET_NOT_CONFIGURED",
  "TRANSACTION_REVERTED",
  "RECEIPT_TIMEOUT",
]);

/** Documented codes of each read action without a test yet: `domain.action` → codes. */
const uncovered: Readonly<Record<string, readonly string[]>> = {};

/** Documented codes of each write action without a test yet: `domain.action` → codes. */
const uncoveredWrites: Readonly<Record<string, readonly string[]>> = {};

const testSources = testFolders.flatMap((folder) =>
  readdirSync(folder, { recursive: true, encoding: "utf8" })
    // This file names every uncovered code; it does not cover them.
    .filter((file) => file.endsWith(".ts") && !file.endsWith("throws-coverage.test.ts"))
    .map((file) => readFileSync(new URL(file, folder), "utf8")),
);

const readActions = Object.entries(Actions as unknown as Record<string, Record<string, unknown>>)
  .filter(([domain]) => domain !== "batch")
  .flatMap(([domain, group]) =>
    Object.entries(group)
      .filter(([, action]) => (action as { readonly request?: unknown }).request !== undefined)
      .map(([name]) => ({ domain, name, path: `${domain}.${name}` })),
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

const writeActions = Object.entries(Actions as unknown as Record<string, Record<string, unknown>>)
  .filter(([domain]) => domain !== "batch")
  .flatMap(([domain, group]) =>
    Object.entries(group)
      .filter(([, action]) => (action as { readonly prepare?: unknown }).prepare !== undefined)
      .map(([name]) => ({ domain, name, path: `${domain}.${name}` })),
  );

const missingCodes = (
  actions: readonly { domain: string; name: string; path: string }[],
  covered: ReadonlySet<string>,
) => {
  const missing: Record<string, string[]> = {};
  for (const { domain, name, path } of actions) {
    const files = testSources.filter((source) => source.includes(path));
    for (const code of documentedCodes(domain, name)) {
      if (covered.has(code)) continue;
      if (files.some((source) => source.includes(`"${code}"`))) continue;
      (missing[path] ??= []).push(code);
    }
  }
  return missing;
};

describe("documented read errors", () => {
  it("are asserted by a test that names the action", () => {
    assert.deepStrictEqual(missingCodes(readActions, coveredEverywhere), uncovered);
  });
});

describe("documented write errors", () => {
  it("are asserted by a test that names the action", () => {
    assert.deepStrictEqual(
      missingCodes(writeActions, new Set([...coveredEverywhere, ...coveredForWrites])),
      uncoveredWrites,
    );
  });
});
