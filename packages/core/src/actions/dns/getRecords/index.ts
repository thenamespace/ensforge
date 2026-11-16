import type { Address, Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads DNS records and the zonehash a name stores on its resolver.
 *
 * **When to use**
 *
 * Use to read DNS data hosted in ENS for any name, not only imported DNS names.
 *
 * **Details**
 *
 * - Each query reads one record set by owner name and type (`1` for A, `16` for TXT, …),
 *   as DNS wire-format resource records.
 * - Missing records, and resolvers without DNS records, read as `null`.
 *
 * **Example** (Reading a TXT record set)
 *
 * ```ts
 * const dns = await ens.dns.getRecords({ name: "alice.eth", records: [{ name: "alice.eth", type: 16 }] })
 * ```
 *
 * **Example** (Reading a TXT record set with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * const dns = await Actions.dns.getRecords(publicClient, { name: "alice.eth", records: [{ name: "alice.eth", type: 16 }] })
 * ```
 *
 * **Example** (Reading a TXT record set in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const dns = yield* Actions.dns.getRecords(ens, { name: "alice.eth", records: [{ name: "alice.eth", type: 16 }] })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for invalid names.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.dns.setRecords} to change them
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getRecords(
  client: Like,
  options: getRecords.Options,
): Promise<getRecords.ReturnType> {
  return Action.promise("dns.getRecords", Impl.getRecords, client, options);
}

export declare namespace getRecords {
  /** Options for {@link getRecords}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** ENS name. Normalized automatically. */
      name: string;
      /** Record sets to read, by DNS owner name and record type. */
      records?: readonly { readonly name: string; readonly type: number }[] | undefined;
    };
  /** The resolver, its zonehash and each queried record set (`null` when missing). */
  type ReturnType = {
    readonly resolver: Address | null;
    readonly zonehash: Hex | null;
    readonly records: readonly {
      readonly name: string;
      readonly type: number;
      readonly data: Hex | null;
    }[];
  };
  /** Errors {@link getRecords} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getRecords.request = Action.request("dns.getRecords", Impl.getRecords);
