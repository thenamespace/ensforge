import type { Hex } from "viem";

import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in TransactionError.Code]: (
    options: TransactionError.Options,
  ) => EnsforgeError.Defaults;
} = {
  TRANSACTION_REVERTED: () => ({ shortMessage: "The transaction reverted on-chain." }),
  TRANSACTION_REPLACED: () => ({ shortMessage: "The transaction was replaced or cancelled." }),
  RECEIPT_TIMEOUT: () => ({
    shortMessage: "Timed out waiting for the transaction receipt.",
    hint: "The transaction may still confirm; check it by hash before retrying.",
  }),
  NONCE_CONFLICT: () => ({
    shortMessage: "The transaction nonce conflicts with another transaction.",
    hint: "Wait for pending transactions to confirm, then retry.",
  }),
};

/**
 * A submitted transaction failed, was replaced, or did not confirm in time.
 *
 * @category errors
 * @since 1.0.0
 */
export class TransactionError extends EnsforgeError<"TransactionError", TransactionError.Code> {
  readonly hash: Hex | undefined;
  /** EIP-5792 bundle id, when the calls were sent as one batch; check it with `getCallsStatus`. */
  readonly bundleId: string | undefined;

  constructor(options: TransactionError.Options) {
    super(
      "TransactionError",
      withDefaults(defaults[options.code](options), options, options.code === "NONCE_CONFLICT"),
    );
    this.hash = options.hash;
    this.bundleId = options.bundleId;
  }
}

export declare namespace TransactionError {
  type Code =
    | "TRANSACTION_REVERTED"
    | "TRANSACTION_REPLACED"
    | "RECEIPT_TIMEOUT"
    | "NONCE_CONFLICT";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly hash?: Hex | undefined;
    readonly bundleId?: string | undefined;
  };
}
