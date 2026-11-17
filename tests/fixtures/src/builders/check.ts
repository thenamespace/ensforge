import { Effect } from "effect";

import { DeployError } from "@ensforge/test-devnet";
import { isAddress, isAddressEqual } from "viem";

const same = (actual: unknown, expected: unknown): boolean =>
  typeof actual === "string" &&
  typeof expected === "string" &&
  isAddress(actual, { strict: false }) &&
  isAddress(expected, { strict: false })
    ? isAddressEqual(actual, expected)
    : actual === expected;

/** Fails the build when a seeded fixture is not in the state it claims. */
export const expectState = (fixture: string, label: string, actual: unknown, expected: unknown) =>
  same(actual, expected)
    ? Effect.void
    : Effect.fail(
        new DeployError({
          step: `fixture ${fixture}`,
          message: `${label}: ${String(actual)}, expected ${String(expected)}`,
        }),
      );
