import { Effect } from "effect";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import { parseName } from "../name/normalize.js";
import type { NameParts } from "../name/parts.js";

/** ENS-only top-level domains, which have no DNS zone. */
const ensTlds = new Set(["eth", "reverse"]);

/** Normalizes a DNS name: one with a DNS top-level domain and no encoded labels. */
export const parseDnsName = (name: string): Effect.Effect<NameParts, AnyError> =>
  parseName(name).pipe(
    Effect.flatMap((parts) =>
      parts.name.includes("[") || ensTlds.has(parts.name.split(".").at(-1) as string)
        ? Effect.fail(
            new InvalidInputError({
              code: "INVALID_NAME",
              input: parts.name,
              shortMessage: `${parts.name} is not a DNS name.`,
            }),
          )
        : Effect.succeed(parts),
    ),
  );
