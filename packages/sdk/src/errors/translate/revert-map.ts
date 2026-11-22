/* oxlint-disable typescript/no-unsafe-type-assertion -- revert arguments are decoded against the error's signature, which TypeScript cannot see */
import { isAddressEqual, zeroAddress, type Address, type Hex } from "viem";

import { dnsDecode } from "../../utils/Name.js";
import {
  CommitmentError,
  ConfigError,
  DnsError,
  GatewayError,
  InsufficientFundsError,
  InvalidInputError,
  MigrationError,
  NameStateError,
  NotFoundError,
  UnauthorizedError,
  UnsupportedError,
} from "../classes/index.js";
import type { EnsforgeError } from "../EnsforgeError.js";
import { offchainWriteRefused } from "./offchainWrite.js";
import { roleNames } from "./role-names.js";

/** Builds the ensforge error for one decoded contract error. */
type Mapper = (args: readonly unknown[], context: EnsforgeError.Context) => EnsforgeError;

const missingRoles: Mapper = ([, roleBitmap, account], context) =>
  new UnauthorizedError({
    code: "MISSING_ROLES",
    account: account as Address,
    roleBitmap: roleBitmap as bigint,
    missingRoles: roleNames(roleBitmap as bigint, context.contractKind),
  });

const cannotGrantRoles: Mapper = ([, roleBitmap, account], context) =>
  new UnauthorizedError({
    code: "CANNOT_GRANT_ROLES",
    account: account as Address,
    roleBitmap: roleBitmap as bigint,
    missingRoles: roleNames(roleBitmap as bigint, context.contractKind),
  });

const notOwner: Mapper = () => new UnauthorizedError({ code: "NOT_OWNER" });
const notApproved: Mapper = () => new UnauthorizedError({ code: "NOT_APPROVED" });
const transferDisallowed: Mapper = () => new UnauthorizedError({ code: "TRANSFER_DISALLOWED" });
const nameNotAvailable: Mapper = () => new NameStateError({ code: "NAME_NOT_AVAILABLE" });
const dnssecProofFailed: Mapper = () => new DnsError({ code: "DNSSEC_PROOF_FAILED" });

// The Universal Resolver and the ENSv1 bridge name the DNS-encoded name they found no usable
// resolver for, which need not be the name read (a primary name's forward check reads another).
const resolverNotFound: Mapper = ([name]) => {
  let resource: string = name as Hex;
  try {
    resource = dnsDecode(name as Hex);
  } catch {
    // Not a DNS-encoded name: keep the bytes.
  }
  return new NotFoundError({ code: "RESOLVER_NOT_FOUND", resource });
};

// An L2 resolver's unruggable verifier rejecting the gateway's proof of L2 state.
const proofNotVerified: Mapper = () =>
  new GatewayError({
    code: "GATEWAY_RESPONSE_INVALID",
    shortMessage: "The gateway's proof of the L2 state did not verify on L1.",
    hint: "The L2 gateway or its verifier is at fault (a proof too old or too new, or a rollup the verifier no longer accepts); try later, or report it to the gateway's operator.",
  });

// ENSv2 commitment errors carry (commitment, bound, now); ENSv1 errors carry only the commitment.
const commitmentTooNew: Mapper = ([commitment, validFrom]) =>
  new CommitmentError({
    code: "COMMITMENT_TOO_NEW",
    commitment: commitment as Hex,
    readyAt: validFrom as bigint | undefined,
  });

const commitmentTooOld: Mapper = ([commitment, validTo]) =>
  new CommitmentError({
    code: "COMMITMENT_TOO_OLD",
    commitment: commitment as Hex,
    expiresAt: validTo as bigint | undefined,
  });

/**
 * Contract error name → ensforge error. `ResolverError` and `ResolutionError` are unwrapped before
 * this table is consulted.
 */
export const revertMap: Readonly<Record<string, Mapper>> = {
  EACUnauthorizedAccountRoles: missingRoles,
  EACCannotGrantRoles: cannotGrantRoles,
  EACCannotRevokeRoles: cannotGrantRoles,
  EACInvalidRoleBitmap: ([roleBitmap]) =>
    new InvalidInputError({ code: "INVALID_ROLES", input: roleBitmap }),
  // Each role counts its holders in four bits.
  EACMaxAssignees: ([, roleBitmap]) =>
    new InvalidInputError({
      code: "INVALID_ROLES",
      input: roleBitmap,
      shortMessage: "A role already has the maximum of 15 holders.",
    }),
  EACInvalidAccount: () =>
    new InvalidInputError({
      code: "INVALID_ADDRESS",
      input: zeroAddress,
      field: "account",
      shortMessage: "Roles cannot be granted to the zero address.",
    }),
  // NameWrapper's `Unauthorised(node, addr)`: not the name's owner. The L2 reverse registrar's
  // `Unauthorised()`: neither the address nor its Ownable owner.
  Unauthorised: (args) =>
    args.length === 0
      ? new UnauthorizedError({
          code: "NOT_APPROVED",
          shortMessage: "The signer may not set this address's primary name.",
          hint: "Send from the address itself or, for a contract, its Ownable owner; or relay a claim from `primaryName.signClaim`.",
        })
      : new UnauthorizedError({ code: "NOT_OWNER" }),
  OwnableUnauthorizedAccount: notOwner,
  ERC1155InsufficientBalance: notOwner,
  WrappedOwnerMismatch: notOwner,
  PermissionDenied: notOwner,
  ERC1155MissingApprovalForAll: notApproved,
  UnauthorizedNamer: notApproved,
  HCADeploymentNotTrusted: () =>
    new UnauthorizedError({
      code: "NOT_APPROVED",
      hint: "The sender is not an HCA the adapter trusts; send from the account itself or its own HCA.",
    }),
  HCAOwnerMismatch: () =>
    new UnauthorizedError({
      code: "NOT_APPROVED",
      hint: "The HCA belongs to another account; an HCA names only its owner.",
    }),
  NotApprovedOperator: notApproved,
  OperationProhibited: () => new UnauthorizedError({ code: "FUSE_BURNED" }),
  TransferDisallowed: transferDisallowed,
  NoNFTAllowed: () =>
    new UnauthorizedError({
      code: "TRANSFER_DISALLOWED",
      hint: "Hosted Contract Accounts accept no name tokens; send the name to the HCA's owner.",
    }),
  TransferUnsafeWithMultipleAssignees: () =>
    new UnauthorizedError({
      code: "TRANSFER_DISALLOWED",
      hint: "Other accounts hold roles on the name; pass `unsafe: true` to transfer anyway.",
    }),
  NameNotAvailable: nameNotAvailable,
  LabelAlreadyRegistered: nameNotAvailable,
  LabelAlreadyReserved: () => new NameStateError({ code: "NAME_RESERVED" }),
  LabelExpired: () => new NameStateError({ code: "NAME_EXPIRED" }),
  NameNotRenewable: () => new NameStateError({ code: "NAME_NOT_RENEWABLE" }),
  NameIsLocked: () => new NameStateError({ code: "NAME_LOCKED" }),
  // The NameWrapper no longer holds the node: never wrapped, or an emancipated child that lapsed.
  NameIsNotWrapped: () => new NameStateError({ code: "NAME_NOT_WRAPPED" }),
  NameRequiresMigration: () => new NameStateError({ code: "NAME_REQUIRES_MIGRATION" }),
  ParentNotMigrated: () => new NameStateError({ code: "PARENT_NOT_MIGRATED" }),
  TransferUnsafeUntilRegistryIsEmancipated: () =>
    new NameStateError({
      code: "REGISTRY_NOT_EMANCIPATED",
      hint: "Pass `unsafe: true` to transfer without the receiver checks.",
    }),
  CommitmentTooNew: commitmentTooNew,
  CommitmentTooOld: commitmentTooOld,
  UnexpiredCommitmentExists: ([commitment]) =>
    new CommitmentError({ code: "COMMITMENT_EXISTS", commitment: commitment as Hex }),
  CommitmentNotFound: ([commitment]) =>
    new CommitmentError({ code: "COMMITMENT_NOT_FOUND", commitment: commitment as Hex }),
  DurationTooShort: () => new InvalidInputError({ code: "DURATION_TOO_SHORT" }),
  CannotReduceExpiry: () => new InvalidInputError({ code: "INVALID_EXPIRY" }),
  CannotSetPastExpiry: () => new InvalidInputError({ code: "INVALID_EXPIRY" }),
  InsufficientValue: () => new InsufficientFundsError({ code: "INSUFFICIENT_ETH" }),
  ERC20InsufficientBalance: ([, balance, needed]) =>
    new InsufficientFundsError({
      code: "INSUFFICIENT_TOKEN_BALANCE",
      available: balance as bigint,
      required: needed as bigint,
    }),
  ERC20InsufficientAllowance: ([, allowance, needed]) =>
    new InsufficientFundsError({
      code: "INSUFFICIENT_TOKEN_BALANCE",
      available: allowance as bigint,
      required: needed as bigint,
      shortMessage: "The payment token allowance is too low.",
      hint: "Approve the registrar to spend the token first; registration plans include this step.",
    }),
  NotValid: ([label]) =>
    new InvalidInputError({
      code: "INVALID_NAME",
      input: label,
      shortMessage: `"${String(label)}" cannot be registered (too short or not allowed).`,
    }),
  PaymentTokenNotSupported: () => new UnsupportedError({ code: "PAYMENT_TOKEN_UNSUPPORTED" }),
  UpgradeTargetNotApproved: () => new UnsupportedError({ code: "UPGRADE_NOT_APPROVED" }),
  InvalidUpgradeTarget: () => new UnsupportedError({ code: "UPGRADE_NOT_APPROVED" }),
  NestedUpgradeNotAllowed: () =>
    new UnsupportedError({
      code: "UPGRADE_NOT_APPROVED",
      shortMessage: "A registry upgrade cannot call another upgrade.",
    }),
  UnsupportedResolverProfile: ([selector]) =>
    new UnsupportedError({
      code: "RESOLVER_PROFILE_UNSUPPORTED",
      context: { selector: selector as Hex },
    }),
  ResolverNotFound: resolverNotFound,
  ResolverNotContract: resolverNotFound,
  // The ENSv1 bridge (ENSV1Resolver) finds no usable ENSv1 resolver for the name.
  UnreachableName: resolverNotFound,
  ReverseAddressMismatch: () => new NotFoundError({ code: "PRIMARY_NAME_MISMATCH" }),
  PrimaryNameNotNormalized: ([name]) =>
    new InvalidInputError({ code: "INVALID_NAME", input: name, field: "primary name" }),
  InvalidRecord: () =>
    new InvalidInputError({
      code: "INVALID_RECORD_VALUE",
      field: "link target",
      shortMessage: "The link target has no records on this resolver.",
    }),
  HttpError: ([status, message]) =>
    new GatewayError({
      code: "GATEWAY_REQUEST_FAILED",
      status: Number(status),
      details: typeof message === "string" && message !== "" ? [`Gateway said: ${message}`] : [],
    }),
  InvalidOffchainLookup: () => new GatewayError({ code: "OFFCHAIN_LOOKUP_INVALID" }),
  // EIP-3668 clients follow only a lookup whose sender is the contract they called, so one from
  // that contract means CCIP-Read is disabled; any other sender (e.g. a registry reverting under
  // the Universal Resolver) is a lookup no client may follow.
  OffchainLookup: ([sender], context) =>
    context.contract !== undefined && !isAddressEqual(sender as Address, context.contract)
      ? new GatewayError({ code: "OFFCHAIN_LOOKUP_INVALID" })
      : new ConfigError({ code: "CCIP_READ_DISABLED" }),
  // ERC-5559 and ERC-7884: where a resolver that does not store records on this chain sends writes.
  StorageHandledByL2: ([chainId, contract]) =>
    offchainWriteRefused(
      `ERC-5559: records are stored by ${String(contract)} on chain ${String(chainId)}.`,
    ),
  StorageHandledByOffChainDatabase: ([, url]) =>
    offchainWriteRefused(`ERC-5559: records are stored by the gateway at ${String(url)}.`),
  OperationHandledOnchain: ([chainId, contract]) =>
    offchainWriteRefused(
      `ERC-7884: writes are handled by ${String(contract)} on chain ${String(chainId)}.`,
    ),
  OperationHandledOffchain: ([, url]) =>
    offchainWriteRefused(`ERC-7884: writes are handled by the gateway at ${String(url)}.`),
  InvalidBatchGatewayResponse: () => new GatewayError({ code: "GATEWAY_RESPONSE_INVALID" }),
  UnsafeBatchGatewayResponse: () => new GatewayError({ code: "GATEWAY_RESPONSE_INVALID" }),
  CommitTooOld: proofNotVerified,
  CommitTooNew: proofNotVerified,
  InvalidProof: proofNotVerified,
  GameNotFound: proofNotVerified,
  InvalidGameTypeBitMask: proofNotVerified,
  OutputNotFound: proofNotVerified,
  TooManyProofs: proofNotVerified,
  RequestOverflow: proofNotVerified,
  InvalidRequest: proofNotVerified,
  InvalidStackIndex: proofNotVerified,
  InvalidOutputIndex: proofNotVerified,
  StackOverflow: proofNotVerified,
  DataMissing: proofNotVerified,
  DataIsNotMod32: proofNotVerified,
  LengthNotMod32: proofNotVerified,
  MaxTreeLeafIndexExceed: proofNotVerified,
  WrongBytesLength: proofNotVerified,
  WrongProofLength: proofNotVerified,
  NameNotLocked: () => new MigrationError({ code: "NAME_NOT_LOCKED" }),
  // Reverse registrars (`SignatureUtils`) and Hosted Contract Accounts: DNSSEC raises no such
  // error, it reports signatures it cannot verify as `NoMatchingProof`.
  InvalidSignature: () => new UnauthorizedError({ code: "SIGNATURE_INVALID" }),
  SignatureExpiryTooHigh: () =>
    new InvalidInputError({
      code: "INVALID_EXPIRY",
      shortMessage: "The signature expires more than one hour after the chain's current time.",
    }),
  // The L2 reverse registrar: a name claim that does not list this chain's coin type.
  CoinTypeNotFound: () =>
    new InvalidInputError({
      code: "INVALID_COIN_TYPE",
      field: "claim",
      shortMessage: "The signed claim does not cover this chain.",
      hint: "Sign a claim whose `chainIds` include this chain.",
    }),
  NotOwnerOfContract: () =>
    new UnauthorizedError({
      code: "NOT_APPROVED",
      shortMessage: "The claim's signer is not the contract's Ownable owner.",
    }),
  TLDNotPublic: () => new DnsError({ code: "TLD_NOT_PUBLIC" }),
  InvalidPublicSuffix: () => new DnsError({ code: "TLD_NOT_PUBLIC" }),
  StaleProof: () => new DnsError({ code: "PROOF_STALE" }),
  NoOwnerRecordFound: () => new DnsError({ code: "DNS_RECORD_MISSING" }),
  InvalidClass: dnssecProofFailed,
  InvalidLabelCount: dnssecProofFailed,
  InvalidProofType: dnssecProofFailed,
  InvalidRRSet: dnssecProofFailed,
  InvalidSignerName: dnssecProofFailed,
  NoMatchingProof: dnssecProofFailed,
  ProofNameMismatch: dnssecProofFailed,
  // DNSSEC's `SignatureExpired(expiration, now)` is an expired RRSIG; the reverse registrars'
  // `SignatureExpired()` an expired name claim.
  SignatureExpired: (args) =>
    args.length === 0
      ? new UnauthorizedError({ code: "SIGNATURE_EXPIRED" })
      : new DnsError({ code: "DNSSEC_PROOF_FAILED" }),
  SignatureNotValidYet: dnssecProofFailed,
  SignatureTypeMismatch: dnssecProofFailed,
};

/**
 * `require` messages of ENSv1 contracts (`Error(string)` reverts) → ensforge error, for the checks
 * those contracts make without custom errors.
 */
export const requireMap: Readonly<Record<string, Mapper>> = {
  // NameWrapper.approve: only the token holder or an operator may approve.
  "ERC721: approve caller is not token owner or approved for all": notOwner,
  // BaseRegistrar transfers, including wrapping a .eth name by sending its token.
  "ERC721: caller is not token owner or approved": notOwner,
  // ReverseRegistrar.setNameForAddr: the address itself, its operator, a controller, or (for a
  // contract) its Ownable owner.
  "ReverseRegistrar: Caller is not a controller or authorised by address or the address itself":
    notApproved,
  // viem's local batch gateway answers a failed gateway request without an HTTP status as
  // `Error(shortMessage)` of the viem error. The Universal Resolver raises it unwrapped, but the
  // ENSv1 bridge (ENSV1Resolver) follows ENSv1 lookups itself, so for bridged names it arrives
  // inside `ResolverError`, like a resolver's own revert: these apply at any depth.
  "HTTP request failed.": () => new GatewayError({ code: "GATEWAY_REQUEST_FAILED" }),
  "The request took too long to respond.": () =>
    new GatewayError({ code: "GATEWAY_REQUEST_FAILED" }),
  "Offchain gateway response is malformed. Response data must be a hex value.": () =>
    new GatewayError({ code: "GATEWAY_RESPONSE_INVALID" }),
};
