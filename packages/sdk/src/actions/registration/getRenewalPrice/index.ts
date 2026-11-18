import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { PaymentToken, RenewalRoute, TokenInfo } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Quotes renewing one or more `.eth` names, in an ERC-20 payment token.
 *
 * **When to use**
 *
 * Use to show the cost of extending names before calling {@link Actions.registration.renew}.
 *
 * **Details**
 *
 * - ENSv2 names renew through the `ETHRegistrar`; names still on ENSv1 renew through
 *   `ETHRenewerV1`. Each item says which (`route`).
 * - Costs one batched call for any number of names.
 *
 * **Example** (Quoting two names)
 *
 * ```ts
 * const { total, items } = await ens.registration.getRenewalPrice({ names: ["alice.eth", "bob.eth"], duration: 31536000n })
 * ```
 *
 * **Example** (Quoting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const quote = await Actions.registration.getRenewalPrice(publicClient, { names: "nick.eth", duration: 31536000n })
 * ```
 *
 * **Example** (Quoting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const quote = yield* Actions.registration.getRenewalPrice(ens, { names: "nick.eth", duration: 31536000n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_RENEWABLE`) when a name is neither registered nor in its grace period.
 * @throws `Errors.UnsupportedError` (`PAYMENT_TOKEN_UNSUPPORTED`, `UNSUPPORTED_ON_DEPLOYMENT`) for an unaccepted token or without ENSv2.
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
 *
 * @see {@link Actions.registration.renew} to renew
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getRenewalPrice(
  client: Like,
  options: getRenewalPrice.Options,
): Promise<getRenewalPrice.ReturnType> {
  return Action.promise("registration.getRenewalPrice", Impl.getRenewalPrice, client, options);
}

export declare namespace getRenewalPrice {
  /** Options for {@link getRenewalPrice}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** One or more `.eth` second-level names. Normalized automatically. */
      names: string | readonly string[];
      /** Renewal length in seconds. */
      duration: bigint;
      /**
       * Token to pay with.
       *
       * @default "usdc"
       */
      paymentToken?: PaymentToken | undefined;
    };
  /** The total and one item per name, in `token` units. */
  type ReturnType = {
    readonly total: bigint;
    readonly token: TokenInfo;
    readonly items: readonly {
      readonly name: string;
      readonly route: RenewalRoute;
      readonly amount: bigint;
    }[];
  };
  /** Errors {@link getRenewalPrice} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnsupportedError;
}

/** Builds a deferred read for `Actions.batch`. */
getRenewalPrice.request = Action.request(
  "registration.getRenewalPrice",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getRenewalPrice as Action.Declared<typeof Impl.getRenewalPrice, getRenewalPrice.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getRenewalPrice.path = "registration.getRenewalPrice" as const;
