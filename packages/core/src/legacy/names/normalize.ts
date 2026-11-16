import { Effect, Schema } from "effect";

import { normalize } from "viem/ens";

import { NameError } from "../errors/name-error.js";
import { defineSyncFunction } from "../internal/sync-function.js";
import { NormalizedLabel, NormalizedName } from "../schemas/name.js";

export const normalizeName = defineSyncFunction(
  Effect.fn("normalizeName")(function* (name: string) {
    return yield* Effect.try({
      try: () => Schema.decodeSync(NormalizedName)(name === "" ? "" : normalize(name)),
      catch: () =>
        new NameError({
          code: "INVALID_NAME",
          message: `Invalid ENS name: ${name}`,
        }),
    });
  }),
);

export const normalizeLabel = defineSyncFunction(
  Effect.fn("normalizeLabel")(function* (label: string) {
    if (label.length === 0 || label.includes(".")) {
      return yield* new NameError({
        code: "INVALID_LABEL",
        message: `Invalid ENS label: ${label}`,
      });
    }

    return yield* Effect.try({
      try: () => Schema.decodeSync(NormalizedLabel)(normalize(label)),
      catch: () =>
        new NameError({
          code: "INVALID_LABEL",
          message: `Invalid ENS label: ${label}`,
        }),
    });
  }),
);
