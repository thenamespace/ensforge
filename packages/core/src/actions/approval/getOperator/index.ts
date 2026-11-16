import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { ApprovalContract } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Checks whether an operator may manage everything an owner holds on an ENS contract
 * (`isApprovedForAll`).
 *
 * **When to use**
 *
 * Use to see whether a marketplace, manager or contract wallet is already approved.
 *
 * **Details**
 *
 * - `contract`: the ENSv1 `"registry"`, `"registrar"` (BaseRegistrar) or `"wrapper"`
 *   (NameWrapper), or any ENSv2 registry or resolver by address.
 *
 * **Example** (Checking a NameWrapper operator)
 *
 * ```ts
 * const approved = await ens.approval.getOperator({ owner, operator, contract: "wrapper" })
 * ```
 *
 * **Example** (Checking an ENSv2 registry with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * const approved = await Actions.approval.getOperator(publicClient, { owner, operator, contract: registry })
 * ```
 *
 * **Example** (Checking in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const approved = yield* Actions.approval.getOperator(ens, { owner, operator, contract: "registry" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for invalid addresses.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) for ENSv1 contracts without ENSv1.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.approval.setOperator} to change it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getOperator(
  client: Like,
  options: getOperator.Options,
): Promise<getOperator.ReturnType> {
  return Action.promise("approval.getOperator", Impl.getOperator, client, options);
}

export declare namespace getOperator {
  /** Options for {@link getOperator}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** Account that granted the approval. */
      owner: string;
      /** Account that may be approved. */
      operator: string;
      /** `"registry"`, `"registrar"`, `"wrapper"`, or a registry or resolver address. */
      contract: ApprovalContract;
    };
  /** Whether `operator` is approved for all of `owner`'s names on the contract. */
  type ReturnType = boolean;
  /** Errors {@link getOperator} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getOperator.request = Action.request("approval.getOperator", Impl.getOperator);
