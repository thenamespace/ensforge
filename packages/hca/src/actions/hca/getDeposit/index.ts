import type { Errors } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Reads an HCA's ERC-4337 EntryPoint deposit, which pays for its UserOperations without a paymaster.
 *
 * **When to use**
 *
 * Use with `bundler()` executions that the HCA pays for itself.
 *
 * **Example** (Reading the deposit)
 *
 * ```ts
 * const deposit = await ens.hca.getDeposit({})
 * ```
 *
 * **Example** (Reading the deposit with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.getDeposit(ens, {})
 * ```
 *
 * **Example** (Reading the deposit in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.getDeposit(ens, {})
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function getDeposit(
  client: Like,
  options?: getDeposit.Options,
): Promise<getDeposit.ReturnType> {
  return Action.promise("hca.getDeposit", Impl.getDeposit, client, options ?? {});
}

export declare namespace getDeposit {
  /** Options for {@link getDeposit}. */
  type Options = {
    /** The HCA's address. */
    address?: string | undefined;
    /**
     * Owner whose HCA to use.
     *
     * @default the client's account
     */
    owner?: string | undefined;
  };
  /** Deposit in wei. */
  type ReturnType = bigint;
  /** Errors {@link getDeposit} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
