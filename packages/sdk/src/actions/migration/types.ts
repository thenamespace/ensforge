import type { Address } from "viem";

import type * as Fuse from "../../utils/Fuse.js";
import type * as Role from "../../utils/Role.js";
import type { set as recordSet } from "../record/set/index.js";

/**
 * How an ENSv1 name moves to ENSv2:
 *
 * - `unwrapped`: a `.eth` second-level name on the BaseRegistrar.
 * - `wrapped-unlocked`: a wrapped `.eth` name without `cannotUnwrap`.
 * - `wrapped-locked`: a wrapped `.eth` name with `cannotUnwrap`; ENSv2 gives it a WrapperRegistry
 *   whose roles follow its fuses.
 * - `locked-child`: a locked or emancipated wrapped subname, moved into its parent's
 *   WrapperRegistry once the parent has migrated.
 *
 * @category migration
 * @since 1.0.0
 */
export type Route = "unwrapped" | "wrapped-unlocked" | "wrapped-locked" | "locked-child";

/**
 * Why a name cannot migrate now:
 *
 * - `not-eth`: not a `.eth` name or one of their subnames.
 * - `expired`: the ENSv1 registration expired (in grace: renew first, or pass `renew`).
 * - `not-reserved`: ENSv2 holds no reservation for the name.
 * - `not-owner`: the account neither holds the name's token nor is an approved operator.
 * - `cannot-transfer`: the `cannotTransfer` fuse is burned.
 * - `frozen-approval`: `cannotApprove` is burned while a token approval is set.
 * - `parent-not-migrated`: a locked child whose parent is still on ENSv1.
 * - `unlocked-child`: a subname without its own token route; it is recreated through its parent
 *   (`subnames`).
 * - `locked-resolver`: `cannotSetResolver` keeps a resolver that could no longer be edited.
 * - `unknown-label`: only the label's hash is known.
 *
 * @category migration
 * @since 1.0.0
 */
export type Blocker =
  | "not-eth"
  | "expired"
  | "not-reserved"
  | "not-owner"
  | "cannot-transfer"
  | "frozen-approval"
  | "parent-not-migrated"
  | "unlocked-child"
  | "locked-resolver"
  | "unknown-label";

/**
 * Where a name's records end up:
 *
 * - `new`: a PermissionedResolver created for the name, with its records copied in.
 * - `owned`: the account's shared PermissionedResolver (the ENS app's address), records copied.
 * - `keep`: the current resolver (records on an ENSv1 public resolver become read-only).
 * - `address`: a resolver the caller names.
 * - `public-v2`: a locked name's public resolver, which ENSv2 swaps for PublicResolverV2.
 * - `none`: no resolver.
 *
 * @category migration
 * @since 1.0.0
 */
export type ResolverPlan = "new" | "owned" | "keep" | "address" | "public-v2" | "none";

/**
 * Migration state of one name.
 *
 * @category migration
 * @since 1.0.0
 */
export type Status = {
  /** Normalized name. */
  readonly name: string;
  readonly status: "eligible" | "blocked" | "migrated" | "not-required";
  readonly route: Route | null;
  readonly blockers: readonly Blocker[];
  /** Holder of the token that moves (registrant or NameWrapper owner). */
  readonly owner: Address | null;
  /** ENSv1 registry owner of an unwrapped `.eth` name, when it differs from the registrant. */
  readonly manager: Address | null;
  /** NameWrapper fuses of a wrapped name. */
  readonly fuses: Fuse.Decoded | null;
  /** ENSv1 expiry. */
  readonly expiry: bigint | null;
  /** Expiry of the ENSv2 reservation the migration claims. */
  readonly reservationExpiry: bigint | null;
  readonly resolver: {
    /** Current ENSv1 resolver. */
    readonly current: Address | null;
    /** What the default migration does with it. */
    readonly plan: ResolverPlan;
  };
  /** ENSv2 state after migrating. */
  readonly after: {
    /** Registry the name lands in. */
    readonly registry: Address | null;
    /** `wrapper-registry` for locked names; `user-registry` when subnames are recreated. */
    readonly subregistry: "wrapper-registry" | "user-registry" | null;
    readonly expiry: bigint | null;
    /** Roles the owner gets on the name. */
    readonly roles: readonly Role.Name[];
  };
};

/**
 * What the client's indexer found to carry over when a name migrates.
 *
 * @category migration
 * @since 1.0.0
 */
export type Discovery = {
  /** Record keys copied to the new resolver, and keys that stay behind (ABIs, public keys…). */
  readonly records: {
    readonly keys: readonly string[];
    readonly skipped: readonly string[];
    /** `false` when the indexer could not list every key. */
    readonly complete: boolean;
  } | null;
  /** Direct subnames recreated in the name's new UserRegistry; `null` for locked names. */
  readonly subnames: readonly string[] | null;
};

/**
 * One name to migrate, with what to carry over.
 *
 * @category migration
 * @since 1.0.0
 */
export type NameInput =
  | string
  | {
      readonly name: string;
      /**
       * Records to write on the name's new resolver: its full profile. Without them the
       * indexer's record inventory is copied (values read on-chain); without an indexer a name
       * whose resolver holds records fails with `RECORDS_UNKNOWN` (or copies the common keys
       * with `allowIncompleteRecords`).
       */
      readonly records?:
        | Omit<recordSet.Options, "name" | "resolver" | "clear" | "pubkey">
        | undefined;
      /**
       * Direct subnames to recreate in a new UserRegistry, by label or full name. Without them
       * the indexer's live subnames are recreated; `[]` recreates none.
       */
      readonly subnames?: readonly string[] | undefined;
    };
