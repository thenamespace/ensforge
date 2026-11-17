import { Schema } from "effect";

import type { Expectation } from "./command.ts";
import type { Model } from "./model.ts";

/** A small non-negative index; commands take entities and actors modulo what exists. */
export const Index = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 5 }),
);

// A write is checked against the latest block but mined in a later one; anvil keeps real time
// after a time jump, so a sequence may drift this far between prediction and execution.
const drift = 60n;

const codesOf = (expectation: Expectation) =>
  "refused" in expectation
    ? expectation.refused
    : "either" in expectation
      ? expectation.either
      : [];

/**
 * `predict` at the model's time and `drift` seconds later: when a boundary falls in between, the
 * write may go either way, with either prediction's refusal codes.
 */
export const stable = (model: Model, predict: (model: Model) => Expectation): Expectation => {
  const now = predict(model);
  const later = predict({ ...model, now: model.now + drift });
  if (JSON.stringify(now) === JSON.stringify(later)) return now;
  return { either: [...new Set([...codesOf(now), ...codesOf(later)])] };
};
