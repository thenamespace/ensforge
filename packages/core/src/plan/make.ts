import type { Address } from "viem";

import type { Plan } from "./Plan.js";

/**
 * Builds a plan from its steps; `calls` is derived.
 *
 * @internal
 */
export const make = (options: {
  readonly operation: string;
  readonly chainId: number;
  readonly account: Address | undefined;
  readonly steps: readonly Plan.Step[];
  readonly requirements?: readonly Plan.Requirement[] | undefined;
  readonly warnings?: readonly Plan.Warning[] | undefined;
}): Plan => ({
  id: crypto.randomUUID(),
  operation: options.operation,
  chainId: options.chainId,
  account: options.account,
  steps: options.steps,
  calls: options.steps.flatMap((step) => step.calls),
  requirements: options.requirements ?? [],
  warnings: options.warnings ?? [],
});
