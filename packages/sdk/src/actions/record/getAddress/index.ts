import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type * as CoinType from "../../../utils/CoinType.js";
import * as Impl from "./effect.js";

/**
 * Reads one address record of an ENS name, for Ethereum by default or any coin (ENSIP-9, ENSIP-11).
 *
 * **When to use**
 *
 * Use to find where to send funds for a name. Use `record.get` to read several coins at once.
 *
 * **Details**
 *
 * - `coin` is a symbol (`"btc"`), an EVM chain (`{ chainId: 8453 }`) or a coin type (`0n`).
 * - EVM coins return a checksummed `Address`; other coins their native format.
 * - EVM chains other than mainnet fall back to the default EVM address (ENSIP-19).
 * - Returns `null` when the record is not set, unless `strict` is set.
 * - Names in an L2 namespace are read on their L2, as `record.get` reads them.
 *
 * **Example** (Resolving an Ethereum address)
 *
 * ```ts
 * const address = await ens.record.getAddress({ name: "nick.eth" })
 * ```
 *
 * **Example** (Resolving a Bitcoin address with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const btc = await Actions.record.getAddress(publicClient, { name: "nick.eth", coin: "btc" })
 * ```
 *
 * **Example** (Resolving a Base address in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const base = yield* Actions.record.getAddress(ens, { name: "nick.eth", coin: { chainId: 8453 } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_COIN_TYPE`) for invalid input.
 * @throws `Errors.NotFoundError` (`RECORD_NOT_FOUND`, `RESOLVER_NOT_FOUND`) with `strict`.
 * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) with `strict` when the name lives on an L2 the client cannot reach.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) with `strict` when the resolver supports none of the records.
 * @throws `Errors.GatewayError` (`GATEWAY_REQUEST_FAILED`, `GATEWAY_RESPONSE_INVALID`, `OFFCHAIN_LOOKUP_INVALID`) when an off-chain gateway fails.
 * @throws `Errors.DnsError` when a DNS name's DNSSEC proof does not verify.
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
 *
 * @see {@link Actions.record.get} to read several records
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getAddress<const coin extends CoinType.Input | undefined = undefined>(
  client: Like,
  options: getAddress.Options<coin>,
): Promise<getAddress.ReturnType<coin>> {
  return Action.promise("record.getAddress", Impl.getAddress, client, options);
}

export declare namespace getAddress {
  /** Options for {@link getAddress}. */
  type Options<coin extends CoinType.Input | undefined = CoinType.Input | undefined> =
    Read.Options & {
      /** ENS name to read. Normalized automatically. */
      name: string;
      /**
       * Coin to read: a symbol, `{ chainId }` or a coin type.
       *
       * @default "eth"
       */
      coin?: coin;
    };
  /** An `Address` for EVM coins, the coin's native format otherwise; `null` when not set. */
  type ReturnType<coin extends CoinType.Input | undefined = CoinType.Input | undefined> =
    coin extends undefined | "eth" | 60n | { readonly chainId: number }
      ? Address | null
      : string | null;
  /** Errors {@link getAddress} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnsupportedError
    | Errors.GatewayError
    | Errors.DnsError;
  /** {@link getAddress} bound to a client, keeping the result typed by `coin`. */
  type Bound = <const coin extends CoinType.Input | undefined = undefined>(
    options: Options<coin>,
  ) => Promise<ReturnType<coin>>;
}

/** Builds a deferred read for `Actions.batch`. */
getAddress.request = Action.request(
  "record.getAddress",
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- Action.Declared narrows errors to the documented @throws; dropping it changes the generic request type
  Impl.getAddress as Action.Declared<typeof Impl.getAddress, getAddress.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getAddress.path = "record.getAddress" as const;
