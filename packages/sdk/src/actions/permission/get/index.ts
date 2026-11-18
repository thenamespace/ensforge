import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type * as Fuse from "../../../utils/Fuse.js";
import type { NameStatus } from "../../name/get/types.js";
import type { Selection } from "../../record/get/types.js";
import * as Impl from "./effect.js";
import type { NameOperation } from "./types.js";

/**
 * Reads what an account may do with an ENS name: transfer it, change its resolver, edit records,
 * create subnames and more, across ENSv1 ownership and ENSv2 roles.
 *
 * **When to use**
 *
 * Use to enable or hide actions in a UI before the user tries them.
 *
 * **Details**
 *
 * - ENSv1: the owner, operators and approved addresses, limited by NameWrapper fuses.
 * - ENSv2: the account's roles on the name and at the root of its registry. The deployment's
 *   current UserRegistry checks `renew` at its root only (contracts-v2 #505).
 * - Records: PermissionedResolver roles, or owner, operator and delegates on public resolvers.
 *   Pass `records` for per-record answers, e.g. which text keys the account may write.
 * - `null` means the permission model is unknown (a custom resolver).
 * - Costs three batched calls.
 *
 * **Example** (Gating a UI)
 *
 * ```ts
 * const { can } = await ens.permission.get({ name: "alice.eth", account })
 * if (can.setRecords) showEditButton()
 * ```
 *
 * **Example** (Per-record access with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const { records } = await Actions.permission.get(publicClient, { name: "alice.eth", account, records: { texts: ["url"] } })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const permissions = yield* Actions.permission.get(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) without `account` or a client account.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.permission.check} for one operation and what is missing
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get(client: Like, options: get.Options): Promise<get.ReturnType> {
  return Action.promise("permission.get", Impl.get, client, options);
}

export declare namespace get {
  /** Options for {@link get}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** ENS name. Normalized automatically. */
      name: string;
      /**
       * Account to check.
       *
       * @default the client's account
       */
      account?: string | undefined;
      /** Records to answer for one by one, in the `record.get` selection shape. */
      records?: Selection | undefined;
    };
  /** What the account may do; `null` when unknown. */
  type ReturnType = {
    readonly account: Address;
    readonly status: NameStatus;
    readonly can: { readonly [operation in NameOperation | "setRecords"]: boolean | null };
    /** Per-record answers, shaped like the `records` selection. */
    readonly records?: Readonly<Record<string, unknown>>;
    /** Burned NameWrapper fuses (wrapped ENSv1 names). */
    readonly fuses: readonly Fuse.Name[];
  };
  /** Errors {@link get} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request("permission.get", Impl.get);

/** Path of the action, e.g. for cache keys. */
get.path = "permission.get" as const;
