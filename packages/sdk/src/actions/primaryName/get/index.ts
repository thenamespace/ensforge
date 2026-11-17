import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type * as CoinType from "../../../utils/CoinType.js";
import * as Impl from "./effect.js";

/**
 * Reads the primary name of an address (ENSIP-19 reverse resolution), verified against the
 * name's address record.
 *
 * **When to use**
 *
 * Use to show a name instead of an address.
 *
 * **Details**
 *
 * - The name counts only when it resolves back to the address, so nobody can claim another
 *   account's name. `verify: false` skips this and returns the raw reverse record.
 * - `coin` selects the chain: `"eth"` (default), any EVM chain such as `{ chainId: 8453 }`, or
 *   `"default"`. Chains without their own primary name fall back to `default.reverse`.
 * - Names that are not normalized are treated as unset.
 * - Returns `null` when there is no valid primary name, unless `strict` is set.
 *
 * **Example** (Showing a name for an address)
 *
 * ```ts
 * const name = await ens.primaryName.get({ address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" })
 * name // "vitalik.eth"
 * ```
 *
 * **Example** (Reading the Base primary name with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const name = await Actions.primaryName.get(publicClient, { address, coin: { chainId: 8453 } })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const name = yield* Actions.primaryName.get(ens, { address, strict: true })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`, `INVALID_COIN_TYPE`, `INVALID_NAME`) for invalid input, or with `strict` an unnormalized name.
 * @throws `Errors.NotFoundError` (`PRIMARY_NAME_NOT_SET`, `PRIMARY_NAME_MISMATCH`) with `strict` when there is no valid primary name.
 * @throws `Errors.GatewayError` when an off-chain gateway fails.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.primaryName.set} to set it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get(client: Like, options: get.Options): Promise<get.ReturnType> {
  return Action.promise("primaryName.get", Impl.get, client, options);
}

export declare namespace get {
  /** Options for {@link get}. */
  type Options = Read.Options & {
    /** Address to look up. */
    address: string;
    /**
     * Chain of the primary name: a coin symbol, `{ chainId }`, a coin type, or `"default"`.
     *
     * @default "eth"
     */
    coin?: CoinType.Input | "default" | undefined;
    /**
     * Require the name to resolve back to the address.
     *
     * @default true
     */
    verify?: boolean | undefined;
  };
  /** The primary name, or `null` when there is no valid one. */
  type ReturnType = string | null;
  /** Errors {@link get} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request("primaryName.get", Impl.get);
