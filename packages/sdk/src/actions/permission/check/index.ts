import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { Operation, PermissionCheck } from "../get/types.js";
import * as Impl from "./effect.js";

/**
 * Checks whether an account may perform one operation on an ENS name, and lists exactly what it
 * lacks when it may not.
 *
 * **When to use**
 *
 * Use to explain to a user why a change is not possible, or which role or approval to request.
 *
 * **Details**
 *
 * - `via` says how the account is allowed: owner, operator, approved, delegate, roles or anyone.
 * - `missing` lists ownership or approvals, roles on a resource, or what blocks the change for
 *   everyone (a burned fuse, the name's status, a transfer rule).
 * - Writes use the same engine to explain failed simulations as `UnauthorizedError`.
 *
 * **Example** (Explaining a disabled button)
 *
 * ```ts
 * const { allowed, missing } = await ens.permission.check({ name: "alice.eth", operation: "setResolver" })
 * ```
 *
 * **Example** (Checking a text record with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const result = await Actions.permission.check(publicClient, { name: "alice.eth", account, operation: { setRecord: "text", key: "url" } })
 * ```
 *
 * **Example** (Checking in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const result = yield* Actions.permission.check(ens, { name: "alice.eth", operation: "transfer" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_COIN_TYPE`) for invalid input.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) without `account` or a client account.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.permission.get} for every operation at once
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function check(client: Like, options: check.Options): Promise<check.ReturnType> {
  return Action.promise("permission.check", Impl.check, client, options);
}

export declare namespace check {
  /** Options for {@link check}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** ENS name. Normalized automatically. */
      name: string;
      /** The operation to check. */
      operation: Operation;
      /**
       * Account to check.
       *
       * @default the client's account
       */
      account?: string | undefined;
    };
  /** Whether it is allowed, how, and what is missing. */
  type ReturnType = PermissionCheck;
  /** Errors {@link check} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
check.request = Action.request("permission.check", Impl.check);
