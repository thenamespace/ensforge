import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { PaymentToken, TokenInfo } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Quotes the price of registering a `.eth` name, in an ERC-20 payment token.
 *
 * **When to use**
 *
 * Use to show the cost before registering, or to see how a recently expired name's premium
 * falls over time.
 *
 * **Details**
 *
 * - `base` is the yearly rent for the label length times the duration; `premium` is charged for
 *   names that recently became available and decays to zero.
 * - Amounts are in the token's smallest unit (USDC has 6 decimals); `token` gives its symbol and
 *   decimals.
 * - `at` prices the name at a future timestamp, e.g. to show when the premium ends.
 *
 * **Gotchas**
 *
 * - The ENSv2 registrar is paid in ERC-20 only; there is no ETH price.
 *
 * **Example** (Quoting one year)
 *
 * ```ts
 * import { Duration } from "@ensforge/sdk"
 *
 * const { total, token } = await ens.registration.getPrice({ name: "alice.eth", duration: Duration.years(1) })
 * ```
 *
 * **Example** (Quoting in DAI with a standalone call)
 *
 * ```ts
 * import { Actions, Duration } from "@ensforge/sdk"
 *
 * const price = await Actions.registration.getPrice(ens, { name: "alice.eth", duration: Duration.years(1), paymentToken: "dai" })
 * ```
 *
 * **Example** (Quoting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const price = yield* Actions.registration.getPrice(ens, { name: "alice.eth", duration: 31536000n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `DURATION_TOO_SHORT`) for invalid input.
 * @throws `Errors.UnsupportedError` (`PAYMENT_TOKEN_UNSUPPORTED`, `UNSUPPORTED_ON_DEPLOYMENT`) for an unaccepted token or without ENSv2.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.registration.register} to register it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getPrice(client: Like, options: getPrice.Options): Promise<getPrice.ReturnType> {
  return Action.promise("registration.getPrice", Impl.getPrice, client, options);
}

export declare namespace getPrice {
  /** Options for {@link getPrice}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** `.eth` second-level name. Normalized automatically. */
      name: string;
      /** Registration length in seconds, e.g. `Duration.years(1)`. */
      duration: bigint;
      /**
       * Token to pay with.
       *
       * @default "usdc"
       */
      paymentToken?: PaymentToken | undefined;
      /**
       * Unix timestamp to price at, for the premium of a recently expired name.
       *
       * @default the current block's timestamp
       */
      at?: bigint | undefined;
    };
  /** Rent, premium and their total, in `token` units. */
  type ReturnType = {
    readonly base: bigint;
    readonly premium: bigint;
    readonly total: bigint;
    readonly token: TokenInfo;
  };
  /** Errors {@link getPrice} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError | Errors.UnsupportedError;
}

/** Builds a deferred read for `Actions.batch`. */
getPrice.request = Action.request(
  "registration.getPrice",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getPrice as Action.Declared<typeof Impl.getPrice, getPrice.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getPrice.path = "registration.getPrice" as const;
