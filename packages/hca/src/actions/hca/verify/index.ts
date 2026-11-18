import type { Errors } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import type { HcaAccount } from "../../../types.js";
import * as Impl from "./effect.js";

/**
 * Checks that an address is a usable ENS HCA of its owner, and returns it.
 *
 * **When to use**
 *
 * Use to check an existing HCA before trusting it, e.g. one stored by the app: it fails instead of returning
 * problems.
 *
 * **Details**
 *
 * - Runs HCA.md's checks: derived address, owner, `accountId`, trusted implementation, factory
 *   certification.
 * - A predicted (not yet deployed) HCA passes; its first execution deploys it.
 *
 * **Example** (Verifying the signer's HCA)
 *
 * ```ts
 * const account = await ens.hca.verify({})
 * ```
 *
 * **Example** (Verifying the signer's HCA with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.verify(ens, {})
 * ```
 *
 * **Example** (Verifying the signer's HCA in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.verify(ens, {})
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_NOT_VERIFIED`) when a check fails.
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function verify(client: Like, options?: verify.Options): Promise<verify.ReturnType> {
  return Action.promise("hca.verify", Impl.verify, client, options ?? {});
}

export declare namespace verify {
  /** Options for {@link verify}. */
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
  /** The verified account. */
  type ReturnType = HcaAccount;
  /** Errors {@link verify} can fail with. */
  type ErrorType = Errors.CommonError | HcaError | Errors.InvalidInputError;
}

/** Builds a deferred read for `Actions.batch`. */
verify.request = Action.request(
  "hca.verify",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.verify as Action.Declared<typeof Impl.verify, verify.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
verify.path = "hca.verify" as const;
