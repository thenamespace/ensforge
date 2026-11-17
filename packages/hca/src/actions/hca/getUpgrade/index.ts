import type { Errors } from "@ensforge/core";
import { Action, type Like } from "@ensforge/core/extension";
import type { Address } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Checks whether an HCA may upgrade to an implementation: both DAO sets must allow it.
 *
 * **When to use**
 *
 * Use to check an upgrade before offering it: it reports which approval is missing.
 *
 * **Example** (Checking an upgrade)
 *
 * ```ts
 * const { allowed } = await ens.hca.getUpgrade({ implementation })
 * ```
 *
 * **Example** (Checking an upgrade with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.getUpgrade(ens, { implementation })
 * ```
 *
 * **Example** (Checking an upgrade in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.getUpgrade(ens, { implementation })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for invalid addresses.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function getUpgrade(
  client: Like,
  options: getUpgrade.Options,
): Promise<getUpgrade.ReturnType> {
  return Action.promise("hca.getUpgrade", Impl.getUpgrade, client, options);
}

export declare namespace getUpgrade {
  /** Options for {@link getUpgrade}. */
  type Options = {
    /** Implementation to upgrade to. */
    implementation: string;
    /** The HCA's address. */
    address?: string | undefined;
    /**
     * Owner whose HCA to check.
     *
     * @default the client's account
     */
    owner?: string | undefined;
  };
  /** Whether the upgrade is allowed, and each approval. */
  type ReturnType = {
    readonly allowed: boolean;
    readonly current: Address | null;
    readonly inUpgradeSet: boolean;
    readonly predecessorAllowed: boolean;
  };
  /** Errors {@link getUpgrade} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
