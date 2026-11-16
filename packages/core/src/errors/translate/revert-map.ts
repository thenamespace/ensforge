import type { Address, Hex } from "viem";

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
 * this table is consulted. Domain phases add rows as they port actions.
 */
export const revertMap: Readonly<Record<string, Mapper>> = {
  EACUnauthorizedAccountRoles: missingRoles,
  EACCannotGrantRoles: cannotGrantRoles,
  EACCannotRevokeRoles: cannotGrantRoles,
  EACInvalidRoleBitmap: ([roleBitmap]) =>
    new InvalidInputError({ code: "INVALID_ROLES", input: roleBitmap }),
  Unauthorised: notOwner,
  OwnableUnauthorizedAccount: notOwner,
  ERC1155InsufficientBalance: notOwner,
  WrappedOwnerMismatch: notOwner,
  PermissionDenied: notOwner,
  ERC1155MissingApprovalForAll: notApproved,
  UnauthorizedNamer: notApproved,
  NotApprovedOperator: notApproved,
  OperationProhibited: () => new UnauthorizedError({ code: "FUSE_BURNED" }),
  TransferDisallowed: transferDisallowed,
  TransferUnsafeWithMultipleAssignees: transferDisallowed,
  NameNotAvailable: nameNotAvailable,
  LabelAlreadyRegistered: nameNotAvailable,
  LabelAlreadyReserved: () => new NameStateError({ code: "NAME_RESERVED" }),
  LabelExpired: () => new NameStateError({ code: "NAME_EXPIRED" }),
  NameNotRenewable: () => new NameStateError({ code: "NAME_NOT_RENEWABLE" }),
  NameIsLocked: () => new NameStateError({ code: "NAME_LOCKED" }),
  NameRequiresMigration: () => new NameStateError({ code: "NAME_REQUIRES_MIGRATION" }),
  ParentNotMigrated: () => new NameStateError({ code: "PARENT_NOT_MIGRATED" }),
  TransferUnsafeUntilRegistryIsEmancipated: () =>
    new NameStateError({ code: "REGISTRY_NOT_EMANCIPATED" }),
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
  UnsupportedResolverProfile: () => new UnsupportedError({ code: "RESOLVER_PROFILE_UNSUPPORTED" }),
  ResolverNotFound: () => new NotFoundError({ code: "RESOLVER_NOT_FOUND" }),
  ResolverNotContract: () => new NotFoundError({ code: "RESOLVER_NOT_FOUND" }),
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
      details: message === undefined || message === "" ? [] : [`Gateway said: ${String(message)}`],
    }),
  InvalidOffchainLookup: () => new GatewayError({ code: "OFFCHAIN_LOOKUP_INVALID" }),
  // Only surfaces as a revert when the client disables CCIP-Read; viem follows it otherwise.
  OffchainLookup: () => new ConfigError({ code: "CCIP_READ_DISABLED" }),
  InvalidBatchGatewayResponse: () => new GatewayError({ code: "GATEWAY_RESPONSE_INVALID" }),
  UnsafeBatchGatewayResponse: () => new GatewayError({ code: "GATEWAY_RESPONSE_INVALID" }),
  NameNotLocked: () => new MigrationError({ code: "NAME_NOT_LOCKED" }),
  TLDNotPublic: () => new DnsError({ code: "TLD_NOT_PUBLIC" }),
  InvalidPublicSuffix: () => new DnsError({ code: "TLD_NOT_PUBLIC" }),
  StaleProof: () => new DnsError({ code: "PROOF_STALE" }),
};
