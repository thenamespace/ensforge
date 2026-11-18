// Setup file of the unit, chain, fuzz and services lanes: records every error a public action
// fails with, through its Effect and Promise APIs, and fails the test file when one is outside
// the action's declared `ErrorType` (KL-04). Errors pass `withContext` (every action, its write
// methods and `…Sync` form) and the Promise runner (`Action.promise`); both are wrapped here.
// Runs in a test file's setup, outside any Effect runtime: synchronous file and environment access.
/* oxlint-disable effecttsgo/node-builtin-import, effecttsgo/process-env */
import { appendFileSync } from "node:fs";

import { afterAll, assert } from "@effect/vitest";
import { Array as Arr, Formatter, String as Str } from "effect";

// Vitest hoists `vi.mock` only when `vi` comes from `vitest` itself.
// oxlint-disable-next-line no-restricted-imports
import { vi } from "vitest";

import { declaredErrors } from "./declared-errors.ts";

type Observed = { readonly path: string; readonly tag: string; readonly code: string };
type Effectish = { readonly pipe: (...operators: readonly unknown[]) => unknown };

const { observed, record } = vi.hoisted(() => {
  const entries = new Map<string, Observed>();
  const add = (path: string, error: unknown) => {
    const { _tag, code } = (error ?? {}) as { readonly _tag?: unknown; readonly code?: unknown };
    // An aborted Promise rejects with `signal.reason`, which is not an ensforge error.
    if (typeof _tag !== "string") return;
    entries.set(`${path} ${_tag} ${String(code)}`, { path, tag: _tag, code: String(code) });
  };
  return { observed: entries, record: add };
});

// vitest requires async `vi.mock` factories.
// oxlint-disable-next-line effecttsgo/async-function
vi.mock("../../../packages/sdk/src/internal/action/context.ts", async (importOriginal) => {
  const { Effect } = await import("effect");
  const original = await importOriginal<{
    readonly withContext: (
      path: string,
      extra?: unknown,
    ) => (effect: Effectish, ...args: readonly unknown[]) => Effectish;
  }>();
  return {
    ...original,
    withContext:
      (path: string, extra?: unknown) =>
      (effect: Effectish, ...args: readonly unknown[]) =>
        original
          .withContext(path, extra)(effect, ...args)
          .pipe(Effect.tapError((error) => Effect.sync(() => record(path, error)))),
  };
});

// oxlint-disable-next-line effecttsgo/async-function
vi.mock("../../../packages/sdk/src/internal/action/promise.ts", async (importOriginal) => {
  type Run = (
    path: string,
    implementation: unknown,
    client: unknown,
    options: unknown,
  ) => Promise<unknown>;
  const original = await importOriginal<{ readonly promise: Run }>();
  const promise: Run = (path, implementation, client, options) =>
    original.promise(path, implementation, client, options).catch((error: unknown) => {
      record(path, error);
      throw error;
    });
  return {
    ...original,
    promise,
    promiseOf: (path: string, implementation: unknown) =>
      Object.assign(
        (client: unknown, options: unknown) => promise(path, implementation, client, options),
        { path },
      ),
  };
});

afterAll(() => {
  if (observed.size === 0) return;
  // `ENSFORGE_ERRORS_LOG=<file>` appends every observed `{ path, tag, code }` as JSON lines.
  const log = process.env.ENSFORGE_ERRORS_LOG;
  if (log !== undefined) {
    appendFileSync(
      log,
      Arr.join(
        Arr.map([...observed.values()], (entry) => `${Formatter.formatJson(entry)}\n`),
        "",
      ),
    );
  }
  const declared = declaredErrors();
  const outside = Arr.flatMap([...observed.values()], ({ path, tag, code }) => {
    // `batch` declares its requests' errors, which each request's own path checks.
    if (path === "batch") return [];
    const errors = declared.get(Str.replace(/\.(prepare|simulate|estimateGas)$/, "")(path));
    if (errors === undefined) {
      // Actions built in tests (`Action.write("test.write", …)`) have no declaration.
      return Arr.some([...declared.keys()], (known) =>
        Str.startsWith(`${Str.split(path, ".")[0]}.`)(known),
      )
        ? [`${path}: no declared ErrorType`]
        : [];
    }
    return errors.has(tag) ? [] : [`${path}: ${tag} ${code}`];
  });

  assert.deepStrictEqual(
    outside,
    [],
    "actions failed with errors outside their declared ErrorType",
  );
});
