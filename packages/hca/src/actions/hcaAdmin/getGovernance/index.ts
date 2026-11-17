import type { Errors } from "@ensforge/core";
import { Action, type Like } from "@ensforge/core/extension";
import type { Address } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Reads who governs ENS HCAs: the factory owner and whether implementations are approved.
 *
 * **When to use**
 *
 * Use to inspect HCA governance before approving or revoking implementations.
 *
 * **Example** (Reading HCA governance)
 *
 * ```ts
 * const governance = await ens.hcaAdmin.getGovernance({ implementation })
 * ```
 *
 * **Example** (Reading HCA governance with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.getGovernance(ens, { implementation })
 * ```
 *
 * **Example** (Reading HCA governance in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.getGovernance(ens, { implementation })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function getGovernance(
  client: Like,
  options?: getGovernance.Options,
): Promise<getGovernance.ReturnType> {
  return Action.promise("hcaAdmin.getGovernance", Impl.getGovernance, client, options ?? {});
}

export declare namespace getGovernance {
  /** Options for {@link getGovernance}. */
  type Options = {
    /** Implementation to check. */
    implementation?: string | undefined;
  };
  /** Factory owner, upgrade set and the implementation's approvals. */
  type ReturnType = {
    readonly factoryOwner: Address;
    readonly upgradeSet: Address;
    readonly deploymentApproved: boolean | null;
    readonly upgradeApproved: boolean | null;
  };
  /** Errors {@link getGovernance} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
