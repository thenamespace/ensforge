import type { Address, Hex } from "viem";

import type { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";

/**
 * A change to a name that permissions are checked for.
 *
 * @category permissions
 * @since 1.0.0
 */
export type NameOperation =
  | "transfer"
  | "setResolver"
  | "setSubregistry"
  | "createSubname"
  | "removeSubname"
  | "renew"
  | "setTtl"
  | "setManager"
  | "reclaim";

/**
 * A record on the name's resolver. `key` narrows keyed records: a text or data key, a coin
 * (symbol or coin type), an ABI content type or an interface ID; without it, any key. `link`
 * replaces the name's whole record (clearing it, or linking it to another name's record); on a
 * PermissionedResolver it needs the root `link` role.
 *
 * @category permissions
 * @since 1.0.0
 */
export type RecordOperation = {
  readonly setRecord:
    | "text"
    | "address"
    | "contentHash"
    | "abi"
    | "pubkey"
    | "name"
    | "interface"
    | "data"
    | "link";
  readonly key?: string | bigint | Hex | undefined;
};

/**
 * Any operation {@link Actions.permission.check} answers for.
 *
 * @category permissions
 * @since 1.0.0
 */
export type Operation = NameOperation | RecordOperation;

/**
 * How an account is allowed: as the `owner`, an `operator` (approved for all), the `approved`
 * address of the token, a resolver `delegate`, through `roles`, or because `anyone` may (e.g.
 * renewing a `.eth` name).
 *
 * @category permissions
 * @since 1.0.0
 */
export type Authority = "owner" | "operator" | "approved" | "delegate" | "roles" | "anyone";

/**
 * Whether an account may perform one operation, and what it lacks when it may not.
 *
 * @category permissions
 * @since 1.0.0
 */
export type PermissionCheck = {
  /** `null` when the contract's permission model is unknown (a custom resolver). */
  readonly allowed: boolean | null;
  readonly via: Authority | null;
  /** Contract that enforces the operation. */
  readonly contract: Address | null;
  /** EAC resource checked, for role-based contracts. */
  readonly resource: bigint | null;
  readonly missing: readonly UnauthorizedError.Requirement[];
};
