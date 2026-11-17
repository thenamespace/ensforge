import { Effect } from "effect";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import { normalize } from "../../utils/Name.js";
import { nameParts, type NameParts } from "./parts.js";

/** `Name.normalize` as an Effect; fails with `InvalidInputError` (`INVALID_NAME`). */
export const normalizeName = (name: string): Effect.Effect<string, AnyError> =>
  Effect.try({ try: () => normalize(name), catch: (error) => error as AnyError });

/** Normalizes a name that must not be the root (`""`), and computes its hashes. */
export const parseName = (name: string): Effect.Effect<NameParts, AnyError> =>
  normalizeName(name).pipe(
    Effect.flatMap((normalized) =>
      normalized === ""
        ? Effect.fail(
            new InvalidInputError({
              code: "INVALID_NAME",
              input: name,
              shortMessage: "The root name has no state; pass a name.",
            }),
          )
        : Effect.succeed(nameParts(normalized)),
    ),
  );
