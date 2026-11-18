import type { Address } from "viem";

import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in InsufficientFundsError.Code]: (
    options: InsufficientFundsError.Options,
  ) => EnsforgeError.Defaults;
} = {
  INSUFFICIENT_ETH: () => ({ shortMessage: "The account does not have enough ETH." }),
  INSUFFICIENT_TOKEN_BALANCE: () => ({
    shortMessage: "The account does not have enough of the payment token.",
  }),
};

/**
 * The account cannot pay for the operation.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export class InsufficientFundsError extends EnsforgeError<
  "InsufficientFundsError",
  InsufficientFundsError.Code
> {
  readonly required: bigint | undefined;
  readonly available: bigint | undefined;
  /** ERC-20 token, or `undefined` for ETH. */
  readonly token: Address | undefined;

  constructor(options: InsufficientFundsError.Options) {
    super("InsufficientFundsError", withDefaults(defaults[options.code](options), options));
    this.required = options.required;
    this.available = options.available;
    this.token = options.token;
  }
}

export declare namespace InsufficientFundsError {
  type Code = "INSUFFICIENT_ETH" | "INSUFFICIENT_TOKEN_BALANCE";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly required?: bigint | undefined;
    readonly available?: bigint | undefined;
    readonly token?: Address | undefined;
  };
}
