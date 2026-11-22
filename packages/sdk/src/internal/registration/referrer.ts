import { Effect } from "effect";

import { isHex, pad, zeroHash, type Hex } from "viem";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";

/**
 * The 32-byte referrer tag: up to 32 bytes of hex, left-padded (an address becomes the ENS app's
 * tag for it).
 */
export const referrerOf = (input: Hex | undefined): Effect.Effect<Hex, AnyError> => {
  if (input === undefined) return Effect.succeed(zeroHash);
  if (isHex(input, { strict: true }) && input.length > 2 && input.length <= 66) {
    return Effect.succeed(pad(input, { size: 32 }));
  }

  return Effect.fail(
    new InvalidInputError({
      code: "INVALID_RECORD_VALUE",
      field: "referrer",
      input,
      shortMessage: "The referrer must be at most 32 bytes of hex.",
    }),
  );
};
