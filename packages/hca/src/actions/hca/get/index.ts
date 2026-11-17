import type { Errors } from "@ensforge/core";
import { Action, type Like } from "@ensforge/core/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import type { HcaAccount } from "../../../types.js";
import * as Impl from "./effect.js";

/**
 * Reads an ENS HCA (Hosted Contract Account): its address, owner, implementation, session nonce and verification problems.
 *
 * **When to use**
 *
 * Use to show a user's HCA, or to check it before routing writes through it; works before
 * deployment (predicted address).
 *
 * **Details**
 *
 * - Without `address`, reads the HCA of `owner` (default: the client's account).
 * - `problems` lists failed checks (HCA.md): an empty list means the account is safe to use.
 *
 * **Example** (Reading the signer's HCA)
 *
 * ```ts
 * const account = await ens.hca.get({})
 * ```
 *
 * **Example** (Reading the signer's HCA with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.get(ens, {})
 * ```
 *
 * **Example** (Reading the signer's HCA in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.get(ens, {})
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function get(client: Like, options?: get.Options): Promise<get.ReturnType> {
  return Action.promise("hca.get", Impl.get, client, options ?? {});
}

export declare namespace get {
  /** Options for {@link get}. */
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
  /** The account, deployed or predicted. */
  type ReturnType = HcaAccount;
  /** Errors {@link get} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
