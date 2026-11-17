import { Effect } from "effect";

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
        !parts.name.includes("[") &&
        !["eth", "reverse"].includes(parts.name.split(".").at(-1) as string),
      (parts) =>
        new InvalidInputError({
          code: "INVALID_NAME",
          input: parts.name,
          shortMessage: `${parts.name} is not a DNS name.`,
        }),
    ),
  );
