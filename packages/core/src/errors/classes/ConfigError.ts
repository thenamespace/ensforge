import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in ConfigError.Code]: (options: ConfigError.Options) => EnsforgeError.Defaults;
} = {
  UNKNOWN_CHAIN: () => ({
    shortMessage: "ensforge has no ENS deployment for this chain.",
    hint: "Pass `deployment` to Ensforge.create, e.g. Deployments.define({ name, chainId, v2 }).",
  }),
  INVALID_DEPLOYMENT: () => ({
    shortMessage: "The deployment profile is invalid.",
    hint: "Check the issues listed in the cause; Deployments.define reports every problem.",
  }),
  CONTRACT_NOT_DEPLOYED: () => ({
    shortMessage: "No contract is deployed at the called address.",
    hint: "Check that the client's chain matches the deployment profile.",
  }),
  WALLET_NOT_CONFIGURED: () => ({
    shortMessage: "This action needs a wallet client with an account.",
    hint: "Pass `walletClient` to Ensforge.create, or `account` to the action.",
  }),
  INDEXER_NOT_CONFIGURED: () => ({
    shortMessage: "This action needs an indexer.",
    hint: "Pass `indexer: bigname()` to Ensforge.create.",
  }),
  CCIP_READ_DISABLED: () => ({
    shortMessage: "This name resolves off-chain, and CCIP-Read is disabled.",
    hint: "Remove `ccipRead: false` from Ensforge.create.",
  }),
};

/**
 * The ensforge client or a call is configured incorrectly. Fix the code; retrying does not help.
 *
 * @category errors
 * @since 1.0.0
 */
export class ConfigError extends EnsforgeError<"ConfigError", ConfigError.Code> {
  constructor(options: ConfigError.Options) {
    super("ConfigError", withDefaults(defaults[options.code](options), options));
  }
}

export declare namespace ConfigError {
  type Code =
    | "UNKNOWN_CHAIN"
    | "INVALID_DEPLOYMENT"
    | "CONTRACT_NOT_DEPLOYED"
    | "WALLET_NOT_CONFIGURED"
    | "INDEXER_NOT_CONFIGURED"
    | "CCIP_READ_DISABLED";
  type Options = EnsforgeError.ClassOptions<Code>;
}
