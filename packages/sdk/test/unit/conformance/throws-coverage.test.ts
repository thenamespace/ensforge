import { readdirSync, readFileSync } from "node:fs";

import { assert, describe, it } from "@effect/vitest";

import { Actions } from "@ensforge/sdk";

// Every error code a read action documents (`@throws … (`CODE`)`) must be asserted by a test that
// names the action. Codes not covered yet are listed below and must shrink, never grow.

const repository = new URL("../../../../../", import.meta.url);
const actionsFolder = new URL("packages/sdk/src/actions/", repository);
const testFolders = ["packages/sdk/test/unit/", "tests/integration/test/"].map(
  (folder) => new URL(folder, repository),
);

// `conformance/invalid-name.test.ts` asserts these for every action generically.
const coveredEverywhere = new Set(["INVALID_NAME"]);

/** Documented codes of each read action without a test yet: `domain.action` → codes. */
const uncovered: Readonly<Record<string, readonly string[]>> = {
  // DNSSEC gateways and proofs: the DNS lane (024).
  "dns.getOffchainResolver": [
    "GATEWAY_REQUEST_FAILED",
    "GATEWAY_RESPONSE_INVALID",
    "UNSUPPORTED_ON_DEPLOYMENT",
  ],
  "dns.getProof": [
    "GATEWAY_REQUEST_FAILED",
    "GATEWAY_RESPONSE_INVALID",
    "UNSUPPORTED_ON_DEPLOYMENT",
  ],
  "dns.getStatus": [
    "GATEWAY_REQUEST_FAILED",
    "GATEWAY_RESPONSE_INVALID",
    "UNSUPPORTED_ON_DEPLOYMENT",
  ],
  // Plans are written by write actions: the write lane (022).
  "plan.reconcile": ["PLAN_NOT_FOUND", "INVALID_RECORD_VALUE"],
};

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

describe("documented read errors", () => {
  it("are asserted by a test that names the action", () => {
    const missing: Record<string, string[]> = {};
    for (const { domain, name, path } of readActions) {
      const files = testSources.filter((source) => source.includes(path));
      for (const code of documentedCodes(domain, name)) {
        if (coveredEverywhere.has(code)) continue;
        if (files.some((source) => source.includes(`"${code}"`))) continue;
        (missing[path] ??= []).push(code);
      }
    }
    assert.deepStrictEqual(missing, uncovered);
  });
});
