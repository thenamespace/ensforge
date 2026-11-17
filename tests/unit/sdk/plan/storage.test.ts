import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import { Effect } from "effect";

import { make } from "@ensforge/sdk/internal/plan/make";
import type { Plan } from "@ensforge/sdk/internal/plan/Plan";
import { localStorage, memoryStorage } from "@ensforge/sdk/internal/plan/storage";

const record = (operation: string, status: Plan.Record["status"] = "pending"): Plan.Record => ({
  plan: make({
    operation,
    chainId: 1,
    account: "0x00000000000000000000000000000000000000A1",
    steps: [
      {
        id: "commit",
        description: "Commit",
        calls: [{ to: "0x00000000000000000000000000000000000000C3", data: "0x01", value: 7n }],
        waitFor: { seconds: 60n },
      },
    ],
    requirements: [{ kind: "balance", amount: 2n ** 70n }],
  }),
  status,
  submitted: {},
  bundles: {},
  updatedAt: 1,
});

/** An in-memory stand-in for the browser's `localStorage`. */
const webStorage = () => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
};

const exercise = (storage: Plan.Storage) =>
  Effect.promise(async () => {
    const first = record("registration.register");
    const second = record("migration.migrate");
    await storage.set(first);
    await storage.set(second);
    await storage.set({ ...first, status: "completed" });

    const stored = await storage.get(first.plan.id);
    const listed = await storage.list();
    await storage.delete(second.plan.id);
    await storage.delete("missing");

    return { first, stored, listed, remaining: await storage.list() };
  });

describe.each([
  { label: "memoryStorage", create: memoryStorage },
  {
    label: "localStorage",
    create: () => {
      vi.stubGlobal("localStorage", webStorage());
      return localStorage();
    },
  },
])("$label", ({ create }) => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.effect("saves, overwrites by plan id, lists and deletes records with bigints intact", () =>
    Effect.gen(function* () {
      const { first, stored, listed, remaining } = yield* exercise(create());

      assert.deepStrictEqual(stored, { ...first, status: "completed" });
      assert.strictEqual(listed.length, 2);
      assert.deepStrictEqual(remaining, [{ ...first, status: "completed" }]);
    }),
  );

  it.effect("returns undefined for an unknown id", () =>
    Effect.gen(function* () {
      const storage = create();
      const stored = yield* Effect.promise(() => storage.get("missing"));

      assert.isUndefined(stored);
    }),
  );
});

describe("localStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.effect("keeps every record under one key, separate per key", () =>
    Effect.gen(function* () {
      const web = webStorage();
      vi.stubGlobal("localStorage", web);
      const saved = record("record.set");

      yield* Effect.promise(() => localStorage().set(saved));
      const elsewhere = yield* Effect.promise(() => localStorage("other").list());

      assert.deepStrictEqual([...web.items.keys()], ["ensforge:plans"]);
      assert.deepStrictEqual(Object.keys(JSON.parse(web.items.get("ensforge:plans") ?? "{}")), [
        saved.plan.id,
      ]);
      assert.deepStrictEqual(elsewhere, []);
    }),
  );

  it.effect("rejects every call where localStorage does not exist", () =>
    Effect.gen(function* () {
      vi.stubGlobal("localStorage", undefined);
      const storage = localStorage();
      const calls: ReadonlyArray<() => Promise<unknown>> = [
        () => storage.get("x"),
        () => storage.set(record("record.set")),
        () => storage.delete("x"),
        () => storage.list(),
      ];

      for (const call of calls) {
        const error = yield* Effect.flip(Effect.tryPromise(call));
        assert.include(String(error.cause), "localStorage is not available");
      }
    }),
  );
});
