import { Effect } from "effect";

import type { AnyError } from "../errors/types.js";
import { normalize } from "../utils/Name.js";

/** `Name.normalize` as an Effect; fails with `InvalidInputError` (`INVALID_NAME`). */
export const normalizeName = (name: string): Effect.Effect<string, AnyError> =>
  Effect.try({ try: () => normalize(name), catch: (error) => error as AnyError });
