import { Effect } from "effect";

import { isAddress, isHex, pad, zeroHash, type Hex } from "viem";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";

/** The 32-byte referrer tag: given as 32 bytes, or an address left-padded (as the ENS app does). */
export const referrerOf = (input: Hex | undefined): Effect.Effect<Hex, AnyError> => {
  if (input === undefined) return Effect.succeed(zeroHash);
  if (isHex(input) && input.length === 66) return Effect.succeed(input);
  if (isAddress(input, { strict: false })) return Effect.succeed(pad(input, { size: 32 }));

  return Effect.fail(
    new InvalidInputError({
      code: "INVALID_RECORD_VALUE",
      field: "referrer",
      input,
      shortMessage: "The referrer must be 32 bytes or an address.",
    }),
  );
};
