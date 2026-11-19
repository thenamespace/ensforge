import { Array as Arr, Effect, FileSystem, Formatter, Path, Record as Rec, Schema } from "effect";

import { SetupError } from "./errors.ts";

const Budgets = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Finite));

/** A budgets file under `.config/`, such as `bundle-budgets.json`. */
export const readBudgets = Effect.fn("budgets.read")(function* (root: string, file: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const budgetsFile = path.join(root, ".config", file);
  return yield* fs.readFileString(budgetsFile).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Budgets)),
    Effect.mapError((cause) => SetupError.make({ message: `${budgetsFile}: ${String(cause)}` })),
  );
});

/** Records `measured` as the budgets in `.config/<file>`. */
export const writeBudgets = Effect.fn("budgets.write")(function* (
  root: string,
  file: string,
  measured: ReadonlyArray<readonly [name: string, value: number]>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.writeFileString(
    path.join(root, ".config", file),
    `${Formatter.formatJson(Rec.fromEntries(measured), { space: 2 })}\n`,
  );
});

/** Scenarios more than 5% over their budget, or without one. */
export const overBudget = (
  measured: ReadonlyArray<readonly [name: string, value: number]>,
  budgets: Readonly<Record<string, number>>,
  unit: string,
) =>
  Arr.flatMap(measured, ([name, value]) => {
    const budget = budgets[name];
    return budget === undefined || value > budget * 1.05
      ? [`${name}: ${value} ${unit} (budget ${budget ?? "none"} ${unit})`]
      : [];
  });
