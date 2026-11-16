import { Schema } from "effect";

import type { BlockParameters } from "../../action/block.js";
import { Namehash } from "../../schemas/hash.js";
import { EthereumAddress } from "../../schemas/identity.js";
import { NormalizedName } from "../../schemas/name.js";
import { InterfaceId } from "../../schemas/records.js";
import type { GetNameStateError } from "../name/get-name-state/types.js";

export type CapabilityError = GetNameStateError;

export type NameCapabilityParameters = { readonly name: string } & BlockParameters;

export type AccountCapabilityParameters = NameCapabilityParameters & {
  readonly account: EthereumAddress;
};

export const RegistryCapabilities = Schema.Struct({
  address: EthereumAddress,
  protocol: Schema.Literals(["v1", "v2"]),
  kind: Schema.Literals(["registry", "name-wrapper", "permissioned-registry", "wrapper-registry"]),
  owned: Schema.Boolean,
  permissioned: Schema.Boolean,
  temporal: Schema.Boolean,
  tokenized: Schema.Boolean,
  wrapped: Schema.Boolean,
  setOwner: Schema.Boolean,
  setResolver: Schema.Boolean,
  createSubname: Schema.Boolean,
  transfer: Schema.Boolean,
  setExpiry: Schema.Boolean,
});
export type RegistryCapabilities = typeof RegistryCapabilities.Type;

export const ResolverProfiles = Schema.Struct({
  address: Schema.Boolean,
  text: Schema.Boolean,
  contentHash: Schema.Boolean,
  abi: Schema.Boolean,
  pubkey: Schema.Boolean,
  interface: Schema.Boolean,
  name: Schema.Boolean,
  data: Schema.Boolean,
  dnsRecord: Schema.Boolean,
  dnsZone: Schema.Boolean,
});
export type ResolverProfiles = typeof ResolverProfiles.Type;

export const ResolverCapabilities = Schema.Struct({
  address: Schema.NullOr(EthereumAddress),
  node: Namehash,
  inherited: Schema.Boolean,
  extended: Schema.Boolean,
  permissioned: Schema.Boolean,
  authorization: Schema.Literals(["none", "owner-delegate", "role", "unknown"]),
  profiles: ResolverProfiles,
});
export type ResolverCapabilities = typeof ResolverCapabilities.Type;

const UnsupportedRolesResult = Schema.Struct({
  supported: Schema.Literal(false),
  protocol: Schema.Literals(["v1", "v2"]),
  reason: Schema.Literals(["ROLE_BASED_PERMISSIONS_UNSUPPORTED", "RESOLVER_NOT_FOUND"]),
});

export const RegistryRolesResult = Schema.Union([
  UnsupportedRolesResult,
  Schema.Struct({
    supported: Schema.Literal(true),
    protocol: Schema.Literal("v2"),
    registry: EthereumAddress,
    resource: Schema.BigInt,
    account: EthereumAddress,
    roles: Schema.BigInt,
  }),
]);
export type RegistryRolesResult = typeof RegistryRolesResult.Type;

export const HasRegistryRolesResult = Schema.Union([
  UnsupportedRolesResult,
  Schema.Struct({
    supported: Schema.Literal(true),
    protocol: Schema.Literal("v2"),
    registry: EthereumAddress,
    resource: Schema.BigInt,
    account: EthereumAddress,
    roles: Schema.BigInt,
    authorized: Schema.Boolean,
  }),
]);
export type HasRegistryRolesResult = typeof HasRegistryRolesResult.Type;

export const ResolverRolesResult = Schema.Union([
  UnsupportedRolesResult,
  Schema.Struct({
    supported: Schema.Literal(true),
    protocol: Schema.Literal("v2"),
    resolver: EthereumAddress,
    resource: Schema.BigInt,
    account: EthereumAddress,
    roles: Schema.BigInt,
  }),
]);
export type ResolverRolesResult = typeof ResolverRolesResult.Type;

export const HasResolverRolesResult = Schema.Union([
  UnsupportedRolesResult,
  Schema.Struct({
    supported: Schema.Literal(true),
    protocol: Schema.Literal("v2"),
    resolver: EthereumAddress,
    resource: Schema.BigInt,
    account: EthereumAddress,
    roles: Schema.BigInt,
    authorized: Schema.Boolean,
  }),
]);
export type HasResolverRolesResult = typeof HasResolverRolesResult.Type;

export const RecordOperation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("address"), coinType: Schema.BigInt }),
  Schema.Struct({ type: Schema.Literal("text"), key: Schema.String }),
  Schema.Struct({ type: Schema.Literal("contentHash") }),
  Schema.Struct({ type: Schema.Literal("pubkey") }),
  Schema.Struct({ type: Schema.Literal("abi"), contentType: Schema.optional(Schema.BigInt) }),
  Schema.Struct({ type: Schema.Literal("interface"), interfaceId: Schema.optional(InterfaceId) }),
  Schema.Struct({ type: Schema.Literal("name") }),
  Schema.Struct({ type: Schema.Literal("data"), key: Schema.String }),
  Schema.Struct({ type: Schema.Literal("alias") }),
  Schema.Struct({ type: Schema.Literal("dnsRecord") }),
  Schema.Struct({ type: Schema.Literal("dnsZone") }),
  Schema.Struct({ type: Schema.Literal("clear") }),
]);
export type RecordOperation = typeof RecordOperation.Type;

export const RegistryOperation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("setOwner") }),
  Schema.Struct({ type: Schema.Literal("setTtl") }),
  Schema.Struct({ type: Schema.Literal("setResolver") }),
  Schema.Struct({ type: Schema.Literal("createSubname") }),
  Schema.Struct({ type: Schema.Literal("transfer") }),
  Schema.Struct({ type: Schema.Literal("setExpiry") }),
]);
export type RegistryOperation = typeof RegistryOperation.Type;

export const WriteOperation = Schema.Union([RecordOperation, RegistryOperation]);
export type WriteOperation = typeof WriteOperation.Type;

export const OperatorApprovalTarget = Schema.Struct({
  kind: Schema.Literals(["registry", "registrar", "wrapper", "resolver"]),
  address: EthereumAddress,
  supported: Schema.Boolean,
  approved: Schema.Boolean,
});
export type OperatorApprovalTarget = typeof OperatorApprovalTarget.Type;

export const OperatorApprovalResult = Schema.Struct({
  owner: EthereumAddress,
  operator: EthereumAddress,
  targets: Schema.Array(OperatorApprovalTarget),
});
export type OperatorApprovalResult = typeof OperatorApprovalResult.Type;

export const TokenApprovalResult = Schema.Union([
  Schema.Struct({
    supported: Schema.Literal(false),
    protocol: Schema.Literals(["v1", "v2"]),
    reason: Schema.Literals(["PER_TOKEN_APPROVAL_UNSUPPORTED", "NAME_NOT_TOKENIZED"]),
  }),
  Schema.Struct({
    supported: Schema.Literal(true),
    protocol: Schema.Literal("v1"),
    kind: Schema.Literals(["registrar", "name-wrapper"]),
    contract: EthereumAddress,
    tokenId: Schema.BigInt,
    approved: Schema.NullOr(EthereumAddress),
  }),
]);
export type TokenApprovalResult = typeof TokenApprovalResult.Type;

export const ResolverDelegateApprovalResult = Schema.Union([
  Schema.Struct({
    supported: Schema.Literal(false),
    protocol: Schema.Literals(["v1", "v2"]),
    reason: Schema.Literals(["RESOLVER_NOT_FOUND", "DELEGATE_APPROVAL_UNSUPPORTED"]),
  }),
  Schema.Struct({
    supported: Schema.Literal(true),
    protocol: Schema.Literals(["v1", "v2"]),
    resolver: EthereumAddress,
    owner: EthereumAddress,
    delegate: EthereumAddress,
    approved: Schema.Boolean,
  }),
]);
export type ResolverDelegateApprovalResult = typeof ResolverDelegateApprovalResult.Type;

export const WrapperPermissionsResult = Schema.Union([
  Schema.Struct({
    supported: Schema.Literal(false),
    protocol: Schema.Literals(["v1", "v2"]),
    reason: Schema.Literal("NAME_NOT_WRAPPED"),
  }),
  Schema.Struct({
    supported: Schema.Literal(true),
    protocol: Schema.Literal("v1"),
    wrapper: EthereumAddress,
    account: EthereumAddress,
    owner: EthereumAddress,
    tokenId: Schema.BigInt,
    fuses: Schema.Number,
    expiry: Schema.BigInt,
    approved: Schema.NullOr(EthereumAddress),
    operatorApproved: Schema.Boolean,
    canModify: Schema.Boolean,
    canExtendSubnames: Schema.Boolean,
    canUnwrap: Schema.Boolean,
    canTransfer: Schema.Boolean,
    canSetResolver: Schema.Boolean,
    canSetTtl: Schema.Boolean,
    canCreateSubname: Schema.Boolean,
    canApprove: Schema.Boolean,
  }),
  Schema.Struct({
    supported: Schema.Literal(true),
    protocol: Schema.Literal("v2"),
    wrapper: EthereumAddress,
    account: EthereumAddress,
    resource: Schema.BigInt,
    roles: Schema.BigInt,
    operatorApproved: Schema.Boolean,
  }),
]);
export type WrapperPermissionsResult = typeof WrapperPermissionsResult.Type;

export const AuthorizationRequirement = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("none") }),
  Schema.Struct({ kind: Schema.Literal("owner") }),
  Schema.Struct({ kind: Schema.Literal("operator-approval") }),
  Schema.Struct({ kind: Schema.Literal("token-approval") }),
  Schema.Struct({ kind: Schema.Literal("resolver-delegate") }),
  Schema.Struct({
    kind: Schema.Literal("registry-role"),
    roles: Schema.BigInt,
    resource: Schema.BigInt,
  }),
  Schema.Struct({
    kind: Schema.Literal("resolver-role"),
    roles: Schema.BigInt,
    resource: Schema.BigInt,
  }),
  Schema.Struct({ kind: Schema.Literal("wrapper-permission") }),
  Schema.Struct({ kind: Schema.Literal("unsupported") }),
]);
export type AuthorizationRequirement = typeof AuthorizationRequirement.Type;

export const AuthorizationSource = Schema.Literals([
  "owner",
  "operator-approval",
  "token-approval",
  "resolver-delegate",
  "registry-role",
  "resolver-role",
  "wrapper-permission",
]);
export type AuthorizationSource = typeof AuthorizationSource.Type;

export const AuthorizationDecision = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("authorized"),
    source: AuthorizationSource,
  }),
  Schema.Struct({
    status: Schema.Literal("unauthorized"),
    requirement: AuthorizationRequirement,
  }),
  Schema.Struct({
    status: Schema.Literal("unknown"),
    reason: Schema.Literal("CUSTOM_RESOLVER"),
  }),
]);
export type AuthorizationDecision = typeof AuthorizationDecision.Type;

export const RecordPermission = Schema.Struct({
  record: RecordOperation,
  supported: Schema.Boolean,
  authorization: AuthorizationDecision,
  requiredRole: Schema.BigInt,
  resource: Schema.NullOr(Schema.BigInt),
});
export type RecordPermission = typeof RecordPermission.Type;

export const RecordPermissionsResult = Schema.Struct({
  resolver: Schema.NullOr(EthereumAddress),
  inherited: Schema.Boolean,
  account: EthereumAddress,
  records: Schema.Array(RecordPermission),
});
export type RecordPermissionsResult = typeof RecordPermissionsResult.Type;

const UnavailableWriteTarget = Schema.Struct({
  available: Schema.Literal(false),
  protocol: Schema.Literals(["v1", "v2"]),
  reason: Schema.Literals(["NAME_NOT_REGISTERED", "RESOLVER_NOT_FOUND", "OPERATION_UNSUPPORTED"]),
});

const AvailableWriteTarget = Schema.Struct({
  available: Schema.Literal(true),
  protocol: Schema.Literals(["v1", "v2"]),
  kind: Schema.Literals(["registry", "registrar", "name-wrapper", "wrapper-registry", "resolver"]),
  address: EthereumAddress,
  operation: WriteOperation,
  node: Namehash,
  tokenId: Schema.NullOr(Schema.BigInt),
  resource: Schema.NullOr(Schema.BigInt),
  inheritedResolver: Schema.Boolean,
});

export const WriteTarget = Schema.Union([UnavailableWriteTarget, AvailableWriteTarget]);
export type WriteTarget = typeof WriteTarget.Type;

const AuthorizationBlocker = Schema.Literals([
  "NAME_NOT_REGISTERED",
  "RESOLVER_NOT_FOUND",
  "OPERATION_UNSUPPORTED",
  "WRAPPER_FUSE",
  "TRANSFER_ROLE",
]);

export const RequiredAuthorizationResult = Schema.Struct({
  account: EthereumAddress,
  operation: WriteOperation,
  target: WriteTarget,
  authorization: AuthorizationDecision,
  blockers: Schema.Array(AuthorizationBlocker),
});
export type RequiredAuthorizationResult = typeof RequiredAuthorizationResult.Type;

export const NameCapabilities = Schema.Struct({
  name: NormalizedName,
  account: EthereumAddress,
  registry: RegistryCapabilities,
  resolver: ResolverCapabilities,
  records: Schema.Array(RecordPermission),
  ownership: Schema.Struct({
    setOwner: Schema.Boolean,
    setResolver: Schema.Boolean,
    createSubname: Schema.Boolean,
    transfer: Schema.Boolean,
    setExpiry: Schema.Boolean,
  }),
});
export type NameCapabilities = typeof NameCapabilities.Type;
