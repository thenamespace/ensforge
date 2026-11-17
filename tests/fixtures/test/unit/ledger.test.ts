import { existsSync, readFileSync } from "node:fs";

import { assert, describe, it } from "@effect/vitest";

import { allFixtures } from "../../src/index.ts";

type Case = { readonly id: string; readonly axis: string; readonly title: string };
type Entry =
  | { readonly na: string }
  | { readonly status: "pending" }
  | { readonly tests: readonly string[] };

const catalog = new URL("../../catalog/", import.meta.url);
const repositoryRoot = new URL("../../../../", import.meta.url);
const cases = JSON.parse(readFileSync(new URL("cases.json", catalog), "utf8")) as Case[];
const ledger = JSON.parse(readFileSync(new URL("ledger.json", catalog), "utf8")) as Record<
  string,
  Entry
>;
const known = new Set(cases.map((entry) => entry.id));

describe("coverage ledger", () => {
  it("has exactly one entry per catalog case", () => {
    const missing = cases
      .filter((entry) => ledger[entry.id] === undefined)
      .map((entry) => entry.id);
    const stale = Object.keys(ledger).filter((id) => !known.has(id));
    assert.deepStrictEqual({ missing, stale }, { missing: [], stale: [] });
  });

  it("gives each case a reason, a pending mark or its tests", () => {
    const invalid = Object.entries(ledger)
      .filter(([, entry]) => {
        if ("na" in entry) return entry.na.trim() === "";
        if ("tests" in entry) return entry.tests.length === 0;
        return entry.status !== "pending";
      })
      .map(([id]) => id);
    assert.deepStrictEqual(invalid, []);
  });

  // `tests` entries are `<file from the repository root> > <test title>`; the file must exist and
  // tag the case in its test meta.
  it("references tests that exist and tag their case", () => {
    const broken = Object.entries(ledger).flatMap(([id, entry]) =>
      "tests" in entry
        ? entry.tests.flatMap((reference) => {
            const file = new URL(reference.split(" > ")[0] as string, repositoryRoot);
            if (!existsSync(file)) return [`${id}: ${reference} (no file)`];
            return readFileSync(file, "utf8").includes(`"${id}"`)
              ? []
              : [`${id}: ${reference} (not tagged)`];
          })
        : [],
    );
    assert.deepStrictEqual(broken, []);
  });
});

describe("fixtures", () => {
  it("have unique IDs", () => {
    const ids = allFixtures.map((fixture) => fixture.id);
    assert.deepStrictEqual(
      ids.filter((id, index) => ids.indexOf(id) !== index),
      [],
    );
  });

  it("serve catalog cases that are applicable", () => {
    const problems = allFixtures.flatMap((fixture) =>
      fixture.cases.flatMap((id) => {
        if (!known.has(id)) return [`${fixture.id}: unknown case ${id}`];
        const entry = ledger[id];
        return entry !== undefined && "na" in entry
          ? [`${fixture.id}: ${id} is not applicable`]
          : [];
      }),
    );
    assert.deepStrictEqual(problems, []);
  });
});
