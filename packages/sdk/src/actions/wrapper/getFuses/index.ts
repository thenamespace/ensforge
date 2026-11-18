import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type * as Fuse from "../../../utils/Fuse.js";
import * as Impl from "./effect.js";

/**
 * Reads the NameWrapper owner, fuses and expiry of an ENSv1 name.
 *
 * **When to use**
 *
 * Use to see which powers an owner or parent has given up on a wrapped name.
 *
 * **Details**
 *
 * - `null` when the name is not wrapped, or is an expired emancipated name.
 * - Expired names report no fuses.
 *
 * **Example** (Reading fuses)
 *
 * ```ts
 * const wrapped = await ens.wrapper.getFuses({ name: "alice.eth" })
 * ```
 *
 * **Example** (Reading fuses with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const wrapped = await Actions.wrapper.getFuses(publicClient, { name: "alice.eth" })
 * ```
 *
 * **Example** (Reading fuses in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const wrapped = yield* Actions.wrapper.getFuses(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for invalid names.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without ENSv1.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.wrapper.setFuses} to burn fuses
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getFuses(client: Like, options: getFuses.Options): Promise<getFuses.ReturnType> {
  return Action.promise("wrapper.getFuses", Impl.getFuses, client, options);
}

export declare namespace getFuses {
  /** Options for {@link getFuses}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** ENS name. Normalized automatically. */
      name: string;
    };
  /** Wrapped owner, fuse mask, burned fuses by name and expiry, or `null`. */
  type ReturnType = {
    readonly owner: Address;
    readonly fuses: number;
    readonly burned: Fuse.Decoded;
    readonly expiry: bigint;
  } | null;
  /** Errors {@link getFuses} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError | Errors.UnsupportedError;
}

/** Builds a deferred read for `Actions.batch`. */
getFuses.request = Action.request(
  "wrapper.getFuses",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getFuses as Action.Declared<typeof Impl.getFuses, getFuses.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getFuses.path = "wrapper.getFuses" as const;
