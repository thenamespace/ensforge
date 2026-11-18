import { Array as Arr } from "effect";
import { SecureRandom } from "effect/crypto";

import type { Address } from "viem";

import type { Plan } from "./Plan.js";

/**
 * Builds a plan from its steps; `calls` is derived.
 *
 * @internal
 * @stability unstable
 */
export const make = (options: {
  readonly operation: string;
  readonly chainId: number;
  readonly account: Address | undefined;
  readonly steps: readonly Plan.Step[];
  readonly requirements?: readonly Plan.Requirement[] | undefined;
  readonly warnings?: readonly Plan.Warning[] | undefined;
  readonly deploys?: readonly Plan.Deployment[] | undefined;
}): Plan => ({
  id: SecureRandom.uuidV4Unsafe(),
  operation: options.operation,
  chainId: options.chainId,
  account: options.account,
  steps: options.steps,
  calls: Arr.flatMap(options.steps, (step) => step.calls),
  requirements: options.requirements ?? [],
  warnings: options.warnings ?? [],
  deploys: options.deploys ?? [],
});
