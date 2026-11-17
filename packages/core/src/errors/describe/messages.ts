import type { AnyError, Code, ErrorOf } from "../types.js";

/** User-facing copy for one error. */
export type Copy = {
  readonly title: string;
  readonly message: string;
  readonly action?: string | undefined;
};

/** Builds the copy for errors with code `code`. */
export type Template<code extends Code = Code> = (error: ErrorOf<code>) => Copy;

const thisName = (error: AnyError): string => error.context.name ?? "This name";

/** Default English copy for every code. Written for end users: no addresses, ABIs or jargon. */
export const messages: { readonly [code in Code]: Template<code> } = {
  UNKNOWN_CHAIN: () => ({
    title: "Network not supported",
    message: "ENS is not available on this network.",
    action: "Switch to Ethereum mainnet or Sepolia.",
  }),
  INVALID_DEPLOYMENT: () => ({
    title: "Configuration problem",
    message: "This app is misconfigured for ENS.",
  }),
  CONTRACT_NOT_DEPLOYED: () => ({
    title: "Network mismatch",
    message: "The ENS contracts were not found on this network.",
    action: "Check that your wallet is on the right network.",
  }),
  WALLET_NOT_CONFIGURED: () => ({
    title: "Wallet not connected",
    message: "Connect a wallet to continue.",
    action: "Connect your wallet.",
  }),
  INDEXER_NOT_CONFIGURED: () => ({
    title: "Search unavailable",
    message: "Name search is not available in this app.",
  }),
  INVALID_ACTION_GROUP: () => ({
    title: "Configuration problem",
    message: "This app is misconfigured.",
  }),
  CCIP_READ_DISABLED: (error) => ({
    title: "Off-chain name",
    message: `${thisName(error)} is stored off-chain, and off-chain lookups are turned off.`,
  }),
  INVALID_NAME: () => ({
    title: "Invalid name",
    message: "This is not a valid ENS name.",
    action: "Check the spelling and remove unsupported characters.",
  }),
  INVALID_ADDRESS: () => ({ title: "Invalid address", message: "This address is not valid." }),
  INVALID_COIN_TYPE: () => ({
    title: "Unsupported network",
    message: "This coin or network is not supported.",
  }),
  INVALID_CONTENT_HASH: () => ({
    title: "Invalid content link",
    message: "This content link is not valid.",
  }),
  INVALID_RECORD_VALUE: () => ({
    title: "Invalid value",
    message: "One of the values is not valid.",
  }),
  INVALID_DURATION: () => ({
    title: "Invalid duration",
    message: "The chosen duration is not valid.",
  }),
  DURATION_TOO_SHORT: () => ({
    title: "Duration too short",
    message: "The registration period is shorter than the minimum.",
    action: "Choose a longer duration.",
  }),
  INVALID_EXPIRY: () => ({ title: "Invalid expiry", message: "The new expiry date is not valid." }),
  INVALID_ROLES: () => ({
    title: "Invalid permissions",
    message: "The selected permissions are not valid.",
  }),
  UNEXPECTED: () => ({
    title: "Something went wrong",
    message: "An unexpected error occurred.",
    action: "Try again. If it keeps happening, contact support.",
  }),
  NAME_NOT_AVAILABLE: (error) => ({
    title: "Name not available",
    message: `${thisName(error)} is already registered.`,
    action: "Try a different name.",
  }),
  NAME_NOT_REGISTERED: (error) => ({
    title: "Name not registered",
    message: `${thisName(error)} is not registered.`,
  }),
  NAME_RESERVED: (error) => ({
    title: "Name reserved",
    message: `${thisName(error)} is reserved.`,
  }),
  NAME_EXPIRED: (error) => ({
    title: "Name expired",
    message: `${thisName(error)} has expired.`,
    action: "Renew it to continue.",
  }),
  NAME_NOT_RENEWABLE: (error) => ({
    title: "Cannot renew",
    message: `${thisName(error)} cannot be renewed.`,
  }),
  NAME_LOCKED: (error) => ({
    title: "Name locked",
    message: `${thisName(error)} is locked and cannot be changed.`,
  }),
  NAME_NOT_WRAPPED: (error) => ({
    title: "Name not wrapped",
    message: `${thisName(error)} is not wrapped.`,
  }),
  LOG_RANGE_TOO_LARGE: () => ({
    title: "History unavailable",
    message: "This RPC provider cannot return events for such a long period.",
  }),
  NAME_UNREACHABLE: (error) => ({
    title: "Name unreachable",
    message: `${thisName(error)} no longer resolves: its parent moved to ENSv2 without it.`,
  }),
  NAME_WRAPPED: (error) => ({
    title: "Name already wrapped",
    message: `${thisName(error)} is already wrapped.`,
  }),
  NAME_REQUIRES_MIGRATION: (error) => ({
    title: "Upgrade required",
    message: `${thisName(error)} needs to be upgraded to the new ENS first.`,
    action: "Upgrade the name.",
  }),
  PARENT_NOT_MIGRATED: () => ({
    title: "Upgrade required",
    message: "The parent name has not been upgraded to the new ENS yet.",
  }),
  REGISTRY_NOT_EMANCIPATED: () => ({
    title: "Transfer blocked",
    message: "This name cannot be transferred safely yet.",
  }),
  COMMITMENT_TOO_NEW: () => ({
    title: "Almost ready",
    message: "Registration needs a short wait after the first step.",
    action: "Wait a minute, then continue.",
  }),
  COMMITMENT_TOO_OLD: () => ({
    title: "Registration expired",
    message: "Too much time passed since the first step.",
    action: "Start the registration again.",
  }),
  COMMITMENT_EXISTS: () => ({
    title: "Already started",
    message: "A registration for this name is already in progress.",
  }),
  COMMITMENT_NOT_FOUND: () => ({
    title: "Registration not started",
    message: "The first registration step was not found.",
    action: "Start the registration again.",
  }),
  NOT_OWNER: (error) => ({
    title: "Not the owner",
    message: `Your account does not own ${error.context.name ?? "this name"}.`,
    action: "Switch to the owner's account.",
  }),
  MISSING_ROLES: (error) => ({
    title: "Permission needed",
    message: `Your account is not allowed to make this change to ${error.context.name ?? "this name"}.`,
    action: "Ask the owner for permission.",
  }),
  CANNOT_GRANT_ROLES: () => ({
    title: "Permission needed",
    message: "Your account cannot change these permissions.",
  }),
  NOT_APPROVED: () => ({
    title: "Approval needed",
    message: "Your account is not approved to manage this name.",
  }),
  FUSE_BURNED: (error) => ({
    title: "Change not allowed",
    message: `${thisName(error)} has a permanent restriction that blocks this change.`,
  }),
  TRANSFER_DISALLOWED: (error) => ({
    title: "Transfer blocked",
    message: `${thisName(error)} cannot be transferred while others hold permissions on it.`,
  }),
  RESOLVER_NOT_FOUND: (error) => ({
    title: "No resolver",
    message: `${thisName(error)} is not set up to hold records yet.`,
    action: "Set a resolver first.",
  }),
  RECORD_NOT_FOUND: () => ({ title: "Not set", message: "This record is not set." }),
  PRIMARY_NAME_NOT_SET: () => ({
    title: "No primary name",
    message: "This address has no primary name.",
  }),
  PRIMARY_NAME_MISMATCH: () => ({
    title: "Primary name not verified",
    message: "The primary name of this address does not point back to it.",
  }),
  REGISTRY_NOT_FOUND: (error) => ({
    title: "Not found",
    message: `${thisName(error)} could not be found.`,
  }),
  PLAN_NOT_FOUND: () => ({
    title: "Nothing to resume",
    message: "There is no saved progress to continue.",
  }),
  UNSUPPORTED_PROTOCOL: () => ({
    title: "Not supported",
    message: "This action is not available for this name.",
  }),
  UNSUPPORTED_ON_DEPLOYMENT: () => ({
    title: "Not supported",
    message: "This action is not available on this network.",
  }),
  RESOLVER_PROFILE_UNSUPPORTED: () => ({
    title: "Not supported",
    message: "This name's resolver does not support this record.",
    action: "Switch to a resolver that supports it.",
  }),
  PAYMENT_TOKEN_UNSUPPORTED: () => ({
    title: "Payment not accepted",
    message: "This token is not accepted for registration.",
  }),
  UPGRADE_NOT_APPROVED: () => ({
    title: "Upgrade not allowed",
    message: "This upgrade has not been approved by ENS.",
  }),
  WALLET_BATCH_UNSUPPORTED: () => ({
    title: "Wallet not supported",
    message: "Your wallet cannot send these transactions together.",
  }),
  INSUFFICIENT_ETH: () => ({
    title: "Not enough ETH",
    message: "Your wallet does not have enough ETH to cover this transaction.",
    action: "Add ETH to your wallet.",
  }),
  INSUFFICIENT_TOKEN_BALANCE: () => ({
    title: "Insufficient balance",
    message: "Your wallet does not have enough tokens to pay.",
  }),
  PRICE_ABOVE_MAXIMUM: () => ({
    title: "Price changed",
    message: "The price went up since you checked.",
    action: "Review the new price and try again.",
  }),
  USER_REJECTED: () => ({
    title: "Request cancelled",
    message: "You cancelled the request in your wallet.",
  }),
  CHAIN_MISMATCH: () => ({
    title: "Wrong network",
    message: "Your wallet is connected to a different network.",
    action: "Switch networks in your wallet.",
  }),
  ACCOUNT_NOT_FOUND: () => ({
    title: "No account",
    message: "No wallet account is selected.",
    action: "Select an account in your wallet.",
  }),
  NOT_ELIGIBLE: (error) => ({
    title: "Upgrade unavailable",
    message: `${thisName(error)} cannot be upgraded to the new ENS yet.`,
  }),
  ALREADY_MIGRATED: (error) => ({
    title: "Already upgraded",
    message: `${thisName(error)} is already upgraded.`,
  }),
  NAME_NOT_LOCKED: (error) => ({
    title: "Upgrade unavailable",
    message: `${thisName(error)} cannot use this upgrade path.`,
  }),
  RECORDS_UNKNOWN: (error) => ({
    title: "Profile needed",
    message: `The records of ${thisName(error)} must be provided before it can be upgraded.`,
  }),
  VERIFICATION_FAILED: (error) => ({
    title: "Upgrade incomplete",
    message: `${thisName(error)} was upgraded, but its new state does not match the plan.`,
  }),
  DNS_RECORD_MISSING: () => ({
    title: "DNS record missing",
    message: "The required DNS TXT record was not found.",
    action: "Add the TXT record at your DNS provider, then retry.",
  }),
  DNS_OWNER_MISMATCH: () => ({
    title: "Owner mismatch",
    message: "The owner in DNS does not match the owner on ENS.",
  }),
  DNSSEC_PROOF_FAILED: () => ({
    title: "DNSSEC problem",
    message: "Your domain's DNSSEC setup could not be verified.",
    action: "Check that DNSSEC is enabled at your DNS provider.",
  }),
  PROOF_STALE: () => ({
    title: "Out of date",
    message: "The DNS data changed.",
    action: "Try again.",
  }),
  TLD_NOT_PUBLIC: () => ({
    title: "Domain not supported",
    message: "This top-level domain cannot be imported into ENS.",
  }),
  RPC_REQUEST_FAILED: () => ({
    title: "Connection problem",
    message: "Could not reach the network.",
    action: "Check your connection and try again.",
  }),
  RPC_TIMEOUT: () => ({
    title: "Network slow",
    message: "The network took too long to respond.",
    action: "Try again.",
  }),
  RATE_LIMITED: () => ({
    title: "Too many requests",
    message: "Please wait a moment.",
    action: "Try again shortly.",
  }),
  GATEWAY_REQUEST_FAILED: () => ({
    title: "Lookup failed",
    message: "The service that stores this name's data did not respond.",
    action: "Try again.",
  }),
  GATEWAY_RESPONSE_INVALID: () => ({
    title: "Lookup failed",
    message: "The service that stores this name's data returned invalid data.",
  }),
  OFFCHAIN_LOOKUP_INVALID: () => ({
    title: "Lookup failed",
    message: "This name's resolver made an invalid off-chain request.",
  }),
  INDEXER_UNAVAILABLE: () => ({
    title: "Data unavailable",
    message: "Name data is temporarily unavailable.",
    action: "Try again.",
  }),
  INDEXER_RATE_LIMITED: () => ({
    title: "Too many requests",
    message: "Please wait a moment.",
    action: "Try again shortly.",
  }),
  INDEXER_RESPONSE_INVALID: () => ({
    title: "Data unavailable",
    message: "Name data could not be loaded.",
  }),
  INDEXER_REQUEST_REJECTED: () => ({
    title: "Search failed",
    message: "This search could not be completed.",
  }),
  INDEXER_BEHIND: () => ({
    title: "Data updating",
    message: "Recent changes may take a moment to appear.",
    action: "Refresh shortly.",
  }),
  TRANSACTION_REVERTED: () => ({
    title: "Transaction failed",
    message: "The transaction was rejected by the network.",
  }),
  TRANSACTION_REPLACED: () => ({
    title: "Transaction replaced",
    message: "The transaction was replaced or cancelled in your wallet.",
  }),
  RECEIPT_TIMEOUT: () => ({
    title: "Still pending",
    message: "The transaction is taking longer than expected to confirm.",
    action: "Check your wallet for its status before retrying.",
  }),
  NONCE_CONFLICT: () => ({
    title: "Transaction conflict",
    message: "Another transaction from your wallet is pending.",
    action: "Wait for it to confirm, then try again.",
  }),
  PLAN_STALE: () => ({
    title: "Out of date",
    message: "Something changed since this was prepared.",
    action: "Start again.",
  }),
  PLAN_CHAIN_MISMATCH: () => ({
    title: "Wrong network",
    message: "This was prepared for a different network.",
  }),
  PLAN_ACCOUNT_MISMATCH: () => ({
    title: "Wrong account",
    message: "This was prepared for a different account.",
  }),
  PLAN_INVALID: () => ({
    title: "Cannot resume",
    message: "The saved progress is damaged.",
    action: "Start again.",
  }),
  CONTRACT_REVERTED: () => ({
    title: "Transaction would fail",
    message: "The network rejected this action.",
  }),
};
