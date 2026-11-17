import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads one text record of an ENS name, such as `url`, `avatar` or `com.twitter`.
 *
 * **When to use**
 *
 * Use to read a single profile field. Use `record.get` to read several records in one call.
 *
 * **Details**
 *
 * - Resolves through the Universal Resolver, so ENSv1, ENSv2, wildcard and off-chain (CCIP-Read)
 *   names all work.
 * - Returns `null` when the record, the resolver, or the resolver's text support is missing,
 *   unless `strict` is set.
 * - Calls made in the same tick are batched into one multicall where possible.
 *
 * **Example** (Reading a profile URL)
 *
 * ```ts
 * const url = await ens.record.getText({ name: "nick.eth", key: "url" })
 * ```
 *
 * **Example** (Reading with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const url = await Actions.record.getText(publicClient, { name: "nick.eth", key: "url" })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const url = yield* Actions.record.getText(ens, { name: "nick.eth", key: "url" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @throws `Errors.NotFoundError` (`RECORD_NOT_FOUND`, `RESOLVER_NOT_FOUND`) with `strict`.
 * @throws `Errors.GatewayError` when an off-chain gateway fails.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.record.set} to write text records
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getText(client: Like, options: getText.Options): Promise<getText.ReturnType> {
  return Action.promise("record.getText", Impl.getText, client, options);
}

export declare namespace getText {
  /** Options for {@link getText}. */
  type Options = Read.Options & {
    /** ENS name to read. Normalized automatically. */
    name: string;
    /** Text record key, e.g. `url`, `avatar`, `com.twitter`. */
    key: string;
  };
  /** The record value, or `null` when it is not set. */
  type ReturnType = string | null;
  /** Errors {@link getText} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getText.request = Action.request("record.getText", Impl.getText);
