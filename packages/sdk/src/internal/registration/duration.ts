import { Effect } from "effect";

import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import * as Duration from "../../utils/Duration.js";

// The ENS app's limit. It also keeps the expiry inside the registrar's `uint64`, which overflows
// (and reverts after the commitment was paid for) far later.
const maxDuration = Duration.years(100);

/**
 * Fails unless `duration` is a number of seconds of at most 100 years. Too short a duration is
 * left to the registrar's minimum (`DURATION_TOO_SHORT`).
 */
export const requireDuration = (duration: bigint): Effect.Effect<bigint, AnyError> =>
  duration >= 0n && duration <= maxDuration
    ? Effect.succeed(duration)
    : Effect.fail(
        new InvalidInputError({
          code: "INVALID_DURATION",
          field: "duration",
          input: duration,
          ...(duration > maxDuration
            ? {
                shortMessage: "A registration or renewal lasts at most 100 years.",
                hint: "Durations are bigint seconds, e.g. Duration.years(1), not milliseconds.",
              }
            : {}),
        }),
      );
