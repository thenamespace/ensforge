import type { Address } from "viem";

import { toNames } from "../../utils/Role.js";
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
    hint: "The owner lacks the role to transfer it, or other accounts hold roles on it (revoke them, or transfer with `unsafe: true`); `requirements` says which.",
  }),
  SIGNATURE_INVALID: () => ({
    shortMessage: "The signature does not authorize this change.",
    hint: "Sign again with the account being named (or the contract's Ownable owner), for the same name, chains and expiry.",
  }),
  SIGNATURE_EXPIRED: () => ({
    shortMessage: "The signature has expired.",
    hint: "Sign again: reverse registrars accept a signature for at most one hour.",
  }),
};

/**
 * The account lacks ownership, approval or roles for this change, or the signature that should
 * authorize it is invalid or expired.
 *
 * @stability stable
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

  /**
   * Reverts are often translated before the contract kind is known; role names are decoded from
   * `roleBitmap` once context names it.
   *
   * @internal
   */
  override withContext(context: EnsforgeError.Context | undefined): this {
    const kind = this.context.contractKind ?? context?.contractKind;
    if (
      this.missingRoles.length === 0 &&
      this.roleBitmap !== undefined &&
      (kind === "registry" || kind === "resolver")
    ) {
      const names = toNames(this.roleBitmap, kind);
      (this as { missingRoles: readonly string[] }).missingRoles = names;
      if (this.code === "MISSING_ROLES" && names.length > 0) {
        (this as { details: readonly string[] }).details = [
          ...this.details,
          `Missing roles: ${names.join(", ")}`,
        ];
      }
    }
    return super.withContext(context);
  }
}

export declare namespace UnauthorizedError {
  type Code =
    | "NOT_OWNER"
    | "MISSING_ROLES"
    | "CANNOT_GRANT_ROLES"
    | "NOT_APPROVED"
    | "FUSE_BURNED"
    | "TRANSFER_DISALLOWED"
    | "SIGNATURE_INVALID"
    | "SIGNATURE_EXPIRED";
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
