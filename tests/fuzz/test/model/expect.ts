import { Formatter, Schema, Array as Arr, Record as Rec } from "effect";

import type { Expectation } from "./command.ts";
import type { Model } from "./model.ts";
import type { World } from "./world.ts";

/** A small non-negative index; commands take entities and actors modulo what exists. */
export const Index = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 5 }),
);

// A write is checked against the latest block but mined in a later one; anvil keeps real time
// after a time jump, so a sequence may drift this far between prediction and execution.
const drift = 60n;

/** Any typed refusal; used only around time boundaries, where the contracts decide. */
export const anyCode = "*";

/**
 * `predict` at the model's time and `drift` seconds later. When a boundary falls in between, the
 * write may go either way, and fail with whatever the contracts raise on the other side of it:
 * ensforge checks the name against the latest block but simulates and mines in a later one.
 */
export const stable = (model: Model, predict: (model: Model) => Expectation): Expectation => {
  const now = predict(model);
  const later = predict({ ...model, now: model.now + drift });
  return Formatter.formatJson(now) === Formatter.formatJson(later) ? now : { either: [anyCode] };
};

/**
 * Whether any name's expiry, grace end or reservation end falls within `drift` of the model's
 * time: a check made now and a simulation of the next block may then rightly disagree.
 */
export const nearBoundary = (model: Model, world: World) => {
  const v1 = Arr.flatMap(Rec.values(model.v1), (entry) => [
    entry.expiry,
    entry.expiry + world.constants.v1GracePeriod,
    entry.reservation,
  ]);
  const v2 = Arr.flatMap(Rec.values(model.v2), (entry) =>
    entry === undefined ? [] : [entry.expiry, entry.expiry + world.constants.gracePeriod],
  );
  return Arr.some(
    [...v1, ...v2],
    (boundary) => boundary >= model.now && boundary <= model.now + drift,
  );
};
