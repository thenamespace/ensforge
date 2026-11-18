import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in WalletError.Code]: (options: WalletError.Options) => EnsforgeError.Defaults;
} = {
  CHAIN_MISMATCH: (o: WalletError.Options) => ({
    shortMessage: `The wallet is on chain ${o.actualChainId ?? "?"}, expected ${o.expectedChainId ?? "?"}.`,
    hint: "Switch the wallet's network, then retry.",
  }),
  ACCOUNT_NOT_FOUND: () => ({
    shortMessage: "The wallet has no account to sign with.",
    hint: "Connect an account, or pass `account` to the action.",
  }),
};

/**
 * The wallet is not in a state to sign: wrong chain or no account.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export class WalletError extends EnsforgeError<"WalletError", WalletError.Code> {
  readonly expectedChainId: number | undefined;
  readonly actualChainId: number | undefined;

  constructor(options: WalletError.Options) {
    super("WalletError", withDefaults(defaults[options.code](options), options));
    this.expectedChainId = options.expectedChainId;
    this.actualChainId = options.actualChainId;
  }
}

export declare namespace WalletError {
  type Code = "CHAIN_MISMATCH" | "ACCOUNT_NOT_FOUND";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly expectedChainId?: number | undefined;
    readonly actualChainId?: number | undefined;
  };
}
