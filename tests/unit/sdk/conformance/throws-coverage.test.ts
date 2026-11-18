import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, String as Str } from "effect";

import { Actions } from "@ensforge/sdk";

import { actionsOf, propertyOf } from "./action-tree";

// Every error code an action documents (`@throws … (`CODE`)`) must be asserted by a test that
// names the action. Codes not covered yet are listed below and must shrink, never grow.

const repository = new URL("../../../../", import.meta.url);
const actionsFolder = fileURLToPath(new URL("packages/sdk/src/actions/", repository));
const testFolders = Arr.map(["tests/unit/sdk/", "tests/integration/test/"], (folder) =>
  fileURLToPath(new URL(folder, repository)),
);

// `conformance/invalid-name.test.ts` asserts these for every action generically. The transport
// and indexer codes come from one translation layer, asserted by `errors/translate/viem.test.ts`
// and `indexer/http.test.ts` rather than once per action. `CONTRACT_NOT_DEPLOYED` is part of
// `Errors.CommonError`, translated in `errors/translate/viem.test.ts`.
const coveredEverywhere = new Set([
  "INVALID_NAME",
  "CONTRACT_NOT_DEPLOYED",
  "RPC_REQUEST_FAILED",
  "RPC_TIMEOUT",
  "RATE_LIMITED",
  "INDEXER_UNAVAILABLE",
  "INDEXER_RATE_LIMITED",
  "INDEXER_BEHIND",
  "INDEXER_REQUEST_REJECTED",
  "INDEXER_RESPONSE_INVALID",
  "GATEWAY_REQUEST_FAILED",
  "GATEWAY_RESPONSE_INVALID",
  "OFFCHAIN_LOOKUP_INVALID",
  "UNEXPECTED",
]);

// Every write signs and sends through one runner: `writes/conformance.test.ts` sends each write
// without a wallet, and `writes/errors.test.ts` reverts and times out a sent one.
const coveredForWrites = new Set([
  "WALLET_NOT_CONFIGURED",
  "TRANSACTION_REVERTED",
  "RECEIPT_TIMEOUT",
  // The signer and wallet translation are shared: `client/signer.test.ts`, `write/send.test.ts`
  // and `errors/translate/viem.test.ts`.
  "USER_REJECTED",
  "CHAIN_MISMATCH",
  "ACCOUNT_NOT_FOUND",
  "NONCE_CONFLICT",
  "WALLET_BATCH_UNSUPPORTED",
  // Part of `Errors.WriteError`: `errors/translate/viem.test.ts` and `revert-map.test.ts`.
  "INSUFFICIENT_ETH",
]);

/** Documented codes of each read action without a test yet: `domain.action` → codes. */
const uncovered: Readonly<Record<string, readonly string[]>> = {};

/** Documented codes of each write action without a test yet: `domain.action` → codes. */
const uncoveredWrites: Readonly<Record<string, readonly string[]>> = {};

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

const readActions = Arr.filter(
  actionsOf(Actions),
  ({ action }) => propertyOf(action, "request") !== undefined,
);

const writeActions = Arr.filter(
  actionsOf(Actions),
  ({ action }) => propertyOf(action, "prepare") !== undefined,
);

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

const missingCodes = Effect.fn("missingCodes")(function* (
  actions: readonly { domain: string; name: string; path: string }[],
  covered: ReadonlySet<string>,
) {
  const sources = yield* testSources;
  const missing: Record<string, string[]> = {};
  for (const { domain, name, path } of actions) {
    const files = Arr.filter(sources, Str.includes(path));
    for (const code of yield* documentedCodes(domain, name)) {
      if (covered.has(code)) continue;
      if (Arr.some(files, Str.includes(`"${code}"`))) continue;
      (missing[path] ??= []).push(code);
    }
  }
  return missing;
});

layer(NodeServices.layer)("documented errors", (it) => {
  it.effect("read errors are asserted by a test that names the action", () =>
    Effect.gen(function* () {
      const missing = yield* missingCodes(readActions, coveredEverywhere);

      assert.deepStrictEqual(missing, uncovered);
    }),
  );

  it.effect("write errors are asserted by a test that names the action", () =>
    Effect.gen(function* () {
      const missing = yield* missingCodes(
        writeActions,
        new Set([...coveredEverywhere, ...coveredForWrites]),
      );

      assert.deepStrictEqual(missing, uncoveredWrites);
    }),
  );
});
