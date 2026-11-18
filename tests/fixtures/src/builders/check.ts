import { Effect } from "effect";

import { DeployError } from "@ensforge/test-devnet";
import { isAddress, isAddressEqual } from "viem";

/** Fails the build when a seeded fixture is not in the state it claims; addresses match in any case. */
export const expectState = (fixture: string, label: string, actual: unknown, expected: unknown) => {
  const same =
    typeof actual === "string" &&
    typeof expected === "string" &&
    isAddress(actual, { strict: false }) &&
    isAddress(expected, { strict: false })
      ? isAddressEqual(actual, expected)
      : actual === expected;
  return same
    ? Effect.void
    : Effect.fail(
        DeployError.make({
          step: `fixture ${fixture}`,
          message: `${label}: ${String(actual)}, expected ${String(expected)}`,
        }),
      );
};
