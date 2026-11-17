import type { Address } from "viem";

import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const who = (o: UnauthorizedError.Options): string => o.account ?? "The account";

const defaults: {
  readonly [code in UnauthorizedError.Code]: (
    options: UnauthorizedError.Options,
  ) => EnsforgeError.Defaults;
} = {
  NOT_OWNER: (o: UnauthorizedError.Options) => ({
    shortMessage: `${who(o)} does not own this name.`,
    hint: "Send from the owner's account.",
  }),
  MISSING_ROLES: (o: UnauthorizedError.Options) => ({
    shortMessage: `${who(o)} is missing the roles this change needs.`,
    details:
      o.missingRoles === undefined || o.missingRoles.length === 0
        ? []
        : [`Missing roles: ${o.missingRoles.join(", ")}`],
    hint: "Ask the name's owner to grant the roles, or send from the owner's account.",
  }),
  CANNOT_GRANT_ROLES: (o: UnauthorizedError.Options) => ({
    shortMessage: `${who(o)} cannot grant or revoke these roles.`,
    hint: "Granting a role needs its admin role.",
  }),
  NOT_APPROVED: (o: UnauthorizedError.Options) => ({
    shortMessage: `${who(o)} is not approved to manage this name.`,
    hint: "Approve the operator first, or send from the owner's account.",
  }),
  FUSE_BURNED: () => ({
    shortMessage: "A burned NameWrapper fuse forbids this change.",
  }),
  TRANSFER_DISALLOWED: () => ({
    shortMessage: "This name cannot be transferred right now.",
    hint: "Other accounts still hold roles on it; revoke them or use an unsafe transfer.",
  }),
};

/**
 * The account lacks ownership, approval or roles for this change.
 *
 * @category errors
 * @since 1.0.0
 */
export class UnauthorizedError extends EnsforgeError<"UnauthorizedError", UnauthorizedError.Code> {
  readonly account: Address | undefined;
  /** Role names the account lacks (`MISSING_ROLES`), decoded when the contract kind is known. */
  readonly missingRoles: readonly string[];
  /** Raw role bitmap from the revert. */
  readonly roleBitmap: bigint | undefined;
  /** What the account lacks, or what blocks the change, from `permission.check`. */
  readonly requirements: readonly UnauthorizedError.Requirement[];

  constructor(options: UnauthorizedError.Options) {
    super("UnauthorizedError", withDefaults(defaults[options.code](options), options));
    this.account = options.account;
    this.missingRoles = options.missingRoles ?? [];
    this.roleBitmap = options.roleBitmap;
    this.requirements = options.requirements ?? [];
  }
}

export declare namespace UnauthorizedError {
  type Code =
    | "NOT_OWNER"
    | "MISSING_ROLES"
    | "CANNOT_GRANT_ROLES"
    | "NOT_APPROVED"
    | "FUSE_BURNED"
    | "TRANSFER_DISALLOWED";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly account?: Address | undefined;
    readonly missingRoles?: readonly string[] | undefined;
    readonly roleBitmap?: bigint | undefined;
    readonly requirements?: readonly Requirement[] | undefined;
  };

  /**
   * One thing an account lacks for a change, or one thing that blocks it for everyone:
   *
   * - `owner`: be `owner` of the name at `contract`, or an account it approved.
   * - `roles`: hold `roles` on `resource` (or the root) of `contract`.
   * - `blocked`: nobody can, because of a burned fuse, the name's status, a transfer rule, or
   *   because the contract does not support it.
   */
  type Requirement =
    | { readonly type: "owner"; readonly contract: Address; readonly owner: Address | null }
    | {
        readonly type: "roles";
        readonly contract: Address;
        readonly resource: bigint;
        readonly roles: readonly string[];
      }
    | {
        readonly type: "blocked";
        readonly reason: "fuse" | "status" | "transfer-disallowed" | "unsupported";
        readonly detail: string;
      };
}
