import type { Errors } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";
import type { Address } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Computes the address of an owner's ENS HCA, deployed or not.
 *
 * **When to use**
 *
 * Use to show or fund an HCA before it exists; the address never changes, even after upgrades.
 *
 * **Example** (Predicting the signer's HCA)
 *
 * ```ts
 * const address = await ens.hca.predictAddress({})
 * ```
 *
 * **Example** (Predicting the signer's HCA with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.predictAddress(ens, {})
 * ```
 *
 * **Example** (Predicting the signer's HCA in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.predictAddress(ens, {})
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid owner.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function predictAddress(
  client: Like,
  options?: predictAddress.Options,
): Promise<predictAddress.ReturnType> {
  return Action.promise("hca.predictAddress", Impl.predictAddress, client, options ?? {});
}

export declare namespace predictAddress {
  /** Options for {@link predictAddress}. */
  type Options = {
    /**
     * The owner.
     *
     * @default the client's account
     */
    owner?: string | undefined;
  };
  /** The HCA address. */
  type ReturnType = Address;
  /** Errors {@link predictAddress} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

/** Path of the action, e.g. for cache keys. */
predictAddress.path = "hca.predictAddress" as const;
