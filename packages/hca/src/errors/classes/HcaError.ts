import { Errors } from "@ensforge/sdk";
import { withDefaults } from "@ensforge/sdk/extension";

const defaults: {
  readonly [code in HcaError.Code]: (options: HcaError.Options) => Errors.EnsforgeError.Defaults;
} = {
  HCA_UNAVAILABLE: () => ({
    shortMessage: "This chain has no ENS HCA deployment.",
    hint: "Use mainnet or Sepolia, or pass a deployment with an `hca` group.",
  }),
  HCA_NOT_VERIFIED: () => ({
    shortMessage: "The account is not a verified ENS HCA of this owner.",
    hint: "Check the address, or let ensforge derive the owner's HCA.",
  }),
  HCA_EXECUTOR_UNSUPPORTED: () => ({
    shortMessage: "No configured executor can run this HCA operation.",
    hint: "Sessions need `rhinestone()`; owner operations work with `owner()`.",
  }),
  HCA_ACTION_NOT_ALLOWED: () => ({
    shortMessage: "The HCA session policy does not allow this call.",
    hint: "Sessions may register names, deploy the session resolver and set its records; send other calls as the owner.",
  }),
  HCA_SESSION_INVALID: () => ({
    shortMessage: "The HCA session is expired, revoked or for another resolver.",
    hint: "Authorize a new session with hca.authorizeSession.",
  }),
  HCA_SAME_CHAIN_SOURCE: () => ({
    shortMessage: "This deployment rejects funding from the chain the HCA is on.",
    hint: "Choose another source chain, or fund the HCA directly.",
  }),
  HCA_BUNDLER_REJECTED: () => ({
    shortMessage: "The bundler rejected the HCA UserOperation.",
    hint: "Check the bundler URL and EntryPoint v0.7 support; HCA UserOperations must be signed by the owner.",
  }),
  HCA_PAYMASTER_REJECTED: () => ({
    shortMessage: "The paymaster refused to sponsor the HCA UserOperation.",
  }),
  HCA_EXECUTION_FAILED: () => ({ shortMessage: "The HCA execution failed." }),
  HCA_EXECUTION_TIMEOUT: () => ({
    shortMessage: "The HCA execution was not included in time.",
    hint: "It may still be included: `plan.resume` checks it again. Raise the executor's `timeout` to wait longer.",
  }),
  HCA_UPGRADE_NOT_ALLOWED: () => ({
    shortMessage: "The DAO's upgrade sets do not allow this HCA upgrade.",
  }),
  HCA_SDK_UNSUPPORTED: () => ({
    shortMessage: "The Rhinestone SDK does not support the standalone ENS HCA.",
    hint: "Use a Rhinestone SDK with standalone HCA support (`ens-standalone-1.1.0`).",
  }),
};

const retryable = new Set<string>(["HCA_BUNDLER_REJECTED"]);

/**
 * An HCA (Hosted Contract Account) operation failed: the account, its session, an executor
 * (bundler, Rhinestone) or the DAO's upgrade sets.
 *
 * @stability experimental
 * @category errors
 * @since 1.0.0
 */
export class HcaError extends Errors.EnsforgeError<"HcaError", HcaError.Code> {
  /** Executor that failed, e.g. `pimlico`. */
  readonly executor: string | undefined;

  constructor(options: HcaError.Options) {
    super(
      "HcaError",
      withDefaults(defaults[options.code](options), options, retryable.has(options.code)),
    );
    this.executor = options.executor;
  }
}

export declare namespace HcaError {
  type Code =
    | "HCA_UNAVAILABLE"
    | "HCA_NOT_VERIFIED"
    | "HCA_EXECUTOR_UNSUPPORTED"
    | "HCA_ACTION_NOT_ALLOWED"
    | "HCA_SESSION_INVALID"
    | "HCA_SAME_CHAIN_SOURCE"
    | "HCA_BUNDLER_REJECTED"
    | "HCA_PAYMASTER_REJECTED"
    | "HCA_EXECUTION_FAILED"
    | "HCA_EXECUTION_TIMEOUT"
    | "HCA_UPGRADE_NOT_ALLOWED"
    | "HCA_SDK_UNSUPPORTED";
  type Options = Errors.EnsforgeError.ClassOptions<Code> & {
    readonly executor?: string | undefined;
  };
}
