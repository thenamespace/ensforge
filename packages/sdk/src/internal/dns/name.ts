import { Array as Arr, Effect, String as Str } from "effect";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import { parseName } from "../name/normalize.js";
import type { NameParts } from "../name/parts.js";

/**
 * Normalizes a DNS name: one with a DNS top-level domain (not the ENS-only `eth` or `reverse`,
 * which have no DNS zone) and no encoded labels.
 */
export const parseDnsName = (name: string): Effect.Effect<NameParts, AnyError> =>
  parseName(name).pipe(
    Effect.filterOrFail(
      (parts) =>
        !Str.includes("[")(parts.name) &&
        !["eth", "reverse"].includes(Arr.lastNonEmpty(Str.split(".")(parts.name))),
      (parts) =>
        new InvalidInputError({
          code: "INVALID_NAME",
          input: parts.name,
          shortMessage: `${parts.name} is not a DNS name.`,
        }),
    ),
  );
