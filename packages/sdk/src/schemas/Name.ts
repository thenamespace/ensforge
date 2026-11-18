import { Schema } from "effect";

import { normalize } from "../utils/Name.js";

export * from "../utils/Name.js";

/**
 * An ENS name that is already normalized (ENSIP-15). Encoded `[labelhash]` labels are accepted.
 *
 * **Example** (Validating input)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { Name } from "@ensforge/sdk/effect"
 *
 * const name = Schema.decodeUnknownSync(Name.Normalized)("nick.eth")
 * ```
 *
 * @stability stable
 * @category schemas
 * @since 1.0.0
 */
export const Normalized = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter<string>((value) => {
      try {
        return normalize(value) === value || "Expected an ENSIP-15 normalized ENS name";
      } catch {
        return "Expected a valid ENS name";
      }
    }),
  ),
  Schema.brand("ens/NormalizedName"),
);

/**
 * A normalized ENS name.
 *
 * @category schemas
 * @since 1.0.0
 */
export type Normalized = typeof Normalized.Type;
