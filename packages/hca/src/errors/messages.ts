import type { HcaError } from "./classes/HcaError.js";

/**
 * Default English copy for every HCA code, shown by `Errors.describe`. Written for end users: no
 * addresses, UserOperations or jargon.
 *
 * @stability experimental
 */
export const messages: {
  readonly [code in HcaError.Code]: (error: HcaError) => {
    readonly title: string;
    readonly message: string;
    readonly action?: string | undefined;
  };
} = {
  HCA_UNAVAILABLE: () => ({
    title: "Network not supported",
    message: "ENS accounts are not available on this network.",
    action: "Switch to Ethereum mainnet or Sepolia.",
  }),
  HCA_NOT_VERIFIED: () => ({
    title: "Account not recognized",
    message: "This is not a verified ENS account for your wallet.",
  }),
  HCA_EXECUTOR_UNSUPPORTED: () => ({
    title: "Cannot continue",
    message: "This app cannot send this action from your ENS account.",
  }),
  HCA_ACTION_NOT_ALLOWED: () => ({
    title: "Not allowed",
    message: "Your session does not allow this action.",
    action: "Approve it from your wallet instead.",
  }),
  HCA_SESSION_INVALID: () => ({
    title: "Session ended",
    message: "Your session has expired or was revoked.",
    action: "Start a new session.",
  }),
  HCA_BUNDLER_REJECTED: () => ({
    title: "Transaction not sent",
    message: "The service that sends your transaction turned it down.",
    action: "Try again.",
  }),
  HCA_PAYMASTER_REJECTED: () => ({
    title: "Fees not covered",
    message: "The service that pays the network fees declined this transaction.",
  }),
  HCA_EXECUTION_FAILED: () => ({
    title: "Transaction failed",
    message: "The transaction from your ENS account failed.",
  }),
  HCA_EXECUTION_TIMEOUT: () => ({
    title: "Still pending",
    message: "The transaction is taking longer than expected to confirm.",
    action: "Check its status before retrying.",
  }),
  HCA_UPGRADE_NOT_ALLOWED: () => ({
    title: "Upgrade unavailable",
    message: "Your ENS account cannot be upgraded to this version.",
  }),
  HCA_SDK_UNSUPPORTED: () => ({
    title: "Configuration problem",
    message: "This app is misconfigured for ENS accounts.",
  }),
};
