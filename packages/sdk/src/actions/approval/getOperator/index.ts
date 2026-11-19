import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
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
 * - `name` instead of `contract`: the contract that holds the name's token, on the chain the name
 *   lives on.
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
 * import { Actions } from "@ensforge/sdk"
 *
 * const approved = await Actions.approval.getOperator(publicClient, { owner, operator, contract: registry })
 * ```
 *
 * **Example** (Checking in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const approved = yield* Actions.approval.getOperator(ens, { owner, operator, contract: "registry" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for invalid addresses.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) for ENSv1 contracts without ENSv1.
 * @throws `Errors.NameStateError` (`NAME_NOT_REGISTERED`, `NAME_EXTERNAL`) for a `name` that is not registered, or that a namespace outside ENS and its L2s manages.
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
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
    } & (
      | {
          /** `"registry"`, `"registrar"`, `"wrapper"`, or a registry or resolver address. */
          contract: ApprovalContract;
          name?: undefined;
        }
      | {
          /** A name whose token contract to read, on the chain the name lives on. */
          name: string;
          contract?: undefined;
        }
    );
  /** Whether `operator` is approved for all of `owner`'s names on the contract. */
  type ReturnType = boolean;
  /** Errors {@link getOperator} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.UnsupportedError
    | Errors.NameStateError;
}

/** Builds a deferred read for `Actions.batch`. */
getOperator.request = Action.request(
  "approval.getOperator",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getOperator as Action.Declared<typeof Impl.getOperator, getOperator.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getOperator.path = "approval.getOperator" as const;
