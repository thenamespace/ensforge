import { NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Record as Rec, Schema, String as Str } from "effect";

import { allFixtures } from "../../src/index.ts";

const Cases = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ id: Schema.String, axis: Schema.String, title: Schema.String })),
);
const Ledger = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Union([
      Schema.Struct({ na: Schema.String }),
      Schema.Struct({ status: Schema.Literal("pending") }),
      Schema.Struct({ tests: Schema.Array(Schema.String) }),
    ]),
  ),
);

const catalog = new URL("../../catalog/", import.meta.url);
const repositoryRoot = new URL("../../../../", import.meta.url);

const loadCatalog = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const casesText = yield* fs.readFileString(new URL("cases.json", catalog).pathname);
  const ledgerText = yield* fs.readFileString(new URL("ledger.json", catalog).pathname);
  const cases = yield* Schema.decodeEffect(Cases)(casesText);
  const ledger = yield* Schema.decodeEffect(Ledger)(ledgerText);
  return { cases, ledger, known: new Set(Arr.map(cases, (entry) => entry.id)) };
});

describe("coverage ledger", () => {
  layer(NodeServices.layer)("catalog", (it) => {
    it.effect("has exactly one entry per catalog case", () =>
      Effect.gen(function* () {
        const { cases, ledger, known } = yield* loadCatalog;
        const missing = Arr.map(
          Arr.filter(cases, (entry) => ledger[entry.id] === undefined),
          (entry) => entry.id,
        );
        const stale = Arr.filter(Rec.keys(ledger), (id) => !known.has(id));
        assert.deepStrictEqual({ missing, stale }, { missing: [], stale: [] });
      }),
    );

    it.effect("gives each case a reason, a pending mark or its tests", () =>
      Effect.gen(function* () {
        const { ledger } = yield* loadCatalog;
        const invalid = Arr.map(
          Arr.filter(Rec.toEntries(ledger), ([, entry]) => {
            if ("na" in entry) return Str.trim(entry.na) === "";
            if ("tests" in entry) return entry.tests.length === 0;
            return entry.status !== "pending";
          }),
          ([id]) => id,
        );
        assert.deepStrictEqual(invalid, []);
      }),
    );

    // `tests` entries are `<file from the repository root> > <test title>`; the file must exist and
    // tag the case in its test meta.
    it.effect("references tests that exist and tag their case", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { ledger } = yield* loadCatalog;
        const references = Arr.flatMap(Rec.toEntries(ledger), ([id, entry]) =>
          "tests" in entry ? Arr.map(entry.tests, (reference) => ({ id, reference })) : [],
        );
        const broken = yield* Effect.forEach(
          references,
          Effect.fnUntraced(function* ({ id, reference }) {
            const file = new URL(Str.split(reference, " > ")[0], repositoryRoot).pathname;
            const exists = yield* fs.exists(file);
            if (!exists) return [`${id}: ${reference} (no file)`];
            const source = yield* fs.readFileString(file);
            return Str.includes(`"${id}"`)(source) ? [] : [`${id}: ${reference} (not tagged)`];
          }),
          { concurrency: 1 },
        );
        assert.deepStrictEqual(Arr.flatten(broken), []);
      }),
    );
  });
});

describe("fixtures", () => {
  layer(NodeServices.layer)("catalog", (it) => {
    it.effect("have unique IDs", () =>
      Effect.sync(() => {
        const ids = Arr.map(allFixtures, (fixture) => fixture.id);
        assert.deepStrictEqual(
          Arr.filter(ids, (id, index) => ids.indexOf(id) !== index),
          [],
        );
      }),
    );

    it.effect("serve catalog cases that are applicable", () =>
      Effect.gen(function* () {
        const { ledger, known } = yield* loadCatalog;
        const problems = Arr.flatMap(allFixtures, (fixture) =>
          Arr.flatMap(fixture.cases, (id) => {
            if (!known.has(id)) return [`${fixture.id}: unknown case ${id}`];
            const entry = ledger[id];
            return entry !== undefined && "na" in entry
              ? [`${fixture.id}: ${id} is not applicable`]
              : [];
          }),
        );
        assert.deepStrictEqual(problems, []);
      }),
    );
  });
});
