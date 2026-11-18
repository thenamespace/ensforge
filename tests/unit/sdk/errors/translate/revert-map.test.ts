import { readFileSync } from "node:fs";

import { assert, describe, it } from "@effect/vitest";

import { Abis, Roles } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { UnauthorizedError } from "@ensforge/sdk/internal/errors/classes/index";
import { fromRevert } from "@ensforge/sdk/internal/errors/translate/revert";
import { revertMap } from "@ensforge/sdk/internal/errors/translate/revert-map";
import { encodeErrorResult, getAddress, parseAbi, type AbiParameter, type Hex } from "viem";

const account = getAddress("0x00000000000000000000000000000000000000a1");
const commitment = `0x${"c0".repeat(32)}` as const;

type Expected = { readonly _tag: string; readonly code: string };

/** The error each mapped contract error becomes; overloads that differ, by argument count. */
const expected: Readonly<Record<string, Expected | Readonly<Record<number, Expected>>>> = {
  EACUnauthorizedAccountRoles: { _tag: "UnauthorizedError", code: "MISSING_ROLES" },
  EACCannotGrantRoles: { _tag: "UnauthorizedError", code: "CANNOT_GRANT_ROLES" },
  EACCannotRevokeRoles: { _tag: "UnauthorizedError", code: "CANNOT_GRANT_ROLES" },
  EACInvalidRoleBitmap: { _tag: "InvalidInputError", code: "INVALID_ROLES" },
  EACMaxAssignees: { _tag: "InvalidInputError", code: "INVALID_ROLES" },
  EACInvalidAccount: { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
  Unauthorised: {
    0: { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
    2: { _tag: "UnauthorizedError", code: "NOT_OWNER" },
  },
  OwnableUnauthorizedAccount: { _tag: "UnauthorizedError", code: "NOT_OWNER" },
  ERC1155InsufficientBalance: { _tag: "UnauthorizedError", code: "NOT_OWNER" },
  WrappedOwnerMismatch: { _tag: "UnauthorizedError", code: "NOT_OWNER" },
  PermissionDenied: { _tag: "UnauthorizedError", code: "NOT_OWNER" },
  ERC1155MissingApprovalForAll: { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
  UnauthorizedNamer: { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
  NotApprovedOperator: { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
  OperationProhibited: { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
  TransferDisallowed: { _tag: "UnauthorizedError", code: "TRANSFER_DISALLOWED" },
  NoNFTAllowed: { _tag: "UnauthorizedError", code: "TRANSFER_DISALLOWED" },
  TransferUnsafeWithMultipleAssignees: { _tag: "UnauthorizedError", code: "TRANSFER_DISALLOWED" },
  NameNotAvailable: { _tag: "NameStateError", code: "NAME_NOT_AVAILABLE" },
  LabelAlreadyRegistered: { _tag: "NameStateError", code: "NAME_NOT_AVAILABLE" },
  LabelAlreadyReserved: { _tag: "NameStateError", code: "NAME_RESERVED" },
  LabelExpired: { _tag: "NameStateError", code: "NAME_EXPIRED" },
  NameNotRenewable: { _tag: "NameStateError", code: "NAME_NOT_RENEWABLE" },
  NameIsLocked: { _tag: "NameStateError", code: "NAME_LOCKED" },
  NameIsNotWrapped: { _tag: "NameStateError", code: "NAME_NOT_WRAPPED" },
  NameRequiresMigration: { _tag: "NameStateError", code: "NAME_REQUIRES_MIGRATION" },
  ParentNotMigrated: { _tag: "NameStateError", code: "PARENT_NOT_MIGRATED" },
  TransferUnsafeUntilRegistryIsEmancipated: {
    _tag: "NameStateError",
    code: "REGISTRY_NOT_EMANCIPATED",
  },
  CommitmentTooNew: { _tag: "CommitmentError", code: "COMMITMENT_TOO_NEW" },
  CommitmentTooOld: { _tag: "CommitmentError", code: "COMMITMENT_TOO_OLD" },
  UnexpiredCommitmentExists: { _tag: "CommitmentError", code: "COMMITMENT_EXISTS" },
  CommitmentNotFound: { _tag: "CommitmentError", code: "COMMITMENT_NOT_FOUND" },
  DurationTooShort: { _tag: "InvalidInputError", code: "DURATION_TOO_SHORT" },
  CannotReduceExpiry: { _tag: "InvalidInputError", code: "INVALID_EXPIRY" },
  CannotSetPastExpiry: { _tag: "InvalidInputError", code: "INVALID_EXPIRY" },
  InsufficientValue: { _tag: "InsufficientFundsError", code: "INSUFFICIENT_ETH" },
  ERC20InsufficientBalance: { _tag: "InsufficientFundsError", code: "INSUFFICIENT_TOKEN_BALANCE" },
  ERC20InsufficientAllowance: {
    _tag: "InsufficientFundsError",
    code: "INSUFFICIENT_TOKEN_BALANCE",
  },
  NotValid: { _tag: "InvalidInputError", code: "INVALID_NAME" },
  PaymentTokenNotSupported: { _tag: "UnsupportedError", code: "PAYMENT_TOKEN_UNSUPPORTED" },
  UpgradeTargetNotApproved: { _tag: "UnsupportedError", code: "UPGRADE_NOT_APPROVED" },
  InvalidUpgradeTarget: { _tag: "UnsupportedError", code: "UPGRADE_NOT_APPROVED" },
  NestedUpgradeNotAllowed: { _tag: "UnsupportedError", code: "UPGRADE_NOT_APPROVED" },
  UnsupportedResolverProfile: { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
  ResolverNotFound: { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" },
  ResolverNotContract: { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" },
  ReverseAddressMismatch: { _tag: "NotFoundError", code: "PRIMARY_NAME_MISMATCH" },
  PrimaryNameNotNormalized: { _tag: "InvalidInputError", code: "INVALID_NAME" },
  UnreachableName: { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" },
  InvalidRecord: { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
  HttpError: { _tag: "GatewayError", code: "GATEWAY_REQUEST_FAILED" },
  InvalidOffchainLookup: { _tag: "GatewayError", code: "OFFCHAIN_LOOKUP_INVALID" },
  OffchainLookup: { _tag: "ConfigError", code: "CCIP_READ_DISABLED" },
  StorageHandledByL2: { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
  StorageHandledByOffChainDatabase: {
    _tag: "UnsupportedError",
    code: "RESOLVER_PROFILE_UNSUPPORTED",
  },
  OperationHandledOnchain: { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
  OperationHandledOffchain: { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
  InvalidBatchGatewayResponse: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  UnsafeBatchGatewayResponse: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  CommitTooOld: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  CommitTooNew: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  InvalidProof: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  GameNotFound: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  InvalidGameTypeBitMask: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  OutputNotFound: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  TooManyProofs: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  RequestOverflow: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  InvalidRequest: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  InvalidStackIndex: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  InvalidOutputIndex: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  StackOverflow: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  DataMissing: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  DataIsNotMod32: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  LengthNotMod32: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  MaxTreeLeafIndexExceed: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  WrongBytesLength: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  WrongProofLength: { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" },
  NameNotLocked: { _tag: "MigrationError", code: "NAME_NOT_LOCKED" },
  TLDNotPublic: { _tag: "DnsError", code: "TLD_NOT_PUBLIC" },
  InvalidPublicSuffix: { _tag: "DnsError", code: "TLD_NOT_PUBLIC" },
  StaleProof: { _tag: "DnsError", code: "PROOF_STALE" },
  NoOwnerRecordFound: { _tag: "DnsError", code: "DNS_RECORD_MISSING" },
  InvalidClass: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
  InvalidLabelCount: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
  InvalidProofType: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
  InvalidRRSet: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
  InvalidSignerName: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
  NoMatchingProof: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
  ProofNameMismatch: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
  SignatureExpired: {
    0: { _tag: "UnauthorizedError", code: "SIGNATURE_EXPIRED" },
    2: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
  },
  InvalidSignature: { _tag: "UnauthorizedError", code: "SIGNATURE_INVALID" },
  SignatureExpiryTooHigh: { _tag: "InvalidInputError", code: "INVALID_EXPIRY" },
  CoinTypeNotFound: { _tag: "InvalidInputError", code: "INVALID_COIN_TYPE" },
  NotOwnerOfContract: { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
  SignatureNotValidYet: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
  SignatureTypeMismatch: { _tag: "DnsError", code: "DNSSEC_PROOF_FAILED" },
};

type ErrorFragment = {
  readonly type: "error";
  readonly name: string;
  readonly inputs: readonly AbiParameter[];
};

const fragmentsOf = (errorName: string): readonly ErrorFragment[] =>
  (Abis.shared.errors as readonly ErrorFragment[]).filter(
    (item) => item.type === "error" && item.name === errorName,
  );

const sample = (parameter: AbiParameter): unknown => {
  const { type } = parameter;
  if (type.endsWith("[]")) return [sample({ ...parameter, type: type.slice(0, -2) })];
  if (type === "tuple" && "components" in parameter) return parameter.components.map(sample);
  if (type === "address") return account;
  if (type === "string") return "label";
  if (type === "bool") return true;
  if (type === "bytes") return "0x0102";
  if (type === "bytes32") return commitment;
  if (type === "bytes4") return "0x12345678";
  if (type.startsWith("uint") || type.startsWith("int")) return 7n;
  throw new Error(`No sample for ABI type ${type}`);
};

/** Every ABI overload of `errorName`, encoded with sample arguments. */
const overloads = (errorName: string): readonly Hex[] =>
  fragmentsOf(errorName).map((fragment) =>
    encodeErrorResult({
      abi: [fragment],
      errorName,
      args: fragment.inputs.map(sample),
    } as never),
  );

const encode = (errorName: string, args: readonly unknown[]): Hex =>
  encodeErrorResult({ abi: Abis.shared.errors, errorName, args } as never);

// Mapped errors no devnet contract is made to raise yet; the list must shrink, never grow.
const notRaisedOnChain = [
  // Batch gateway failures: raised by the Universal Resolver's gateway, not reached here yet.
  "HttpError",
  "InvalidOffchainLookup",
  "InvalidBatchGatewayResponse",
  "UnsafeBatchGatewayResponse",
  // unruggable verifiers check real L2 proofs, which only the fork lane has; primary.test.ts
  // replays InvalidGameTypeBitMask through a mock resolver.
  "CommitTooOld",
  "CommitTooNew",
  "InvalidProof",
  "GameNotFound",
  "InvalidGameTypeBitMask",
  "OutputNotFound",
  "TooManyProofs",
  "RequestOverflow",
  "InvalidRequest",
  "InvalidStackIndex",
  "InvalidOutputIndex",
  "StackOverflow",
  "DataMissing",
  "DataIsNotMod32",
  "LengthNotMod32",
  "MaxTreeLeafIndexExceed",
  "WrongBytesLength",
  "WrongProofLength",
  // Not reached by a devnet scenario yet: ensforge refuses most of these states before sending,
  // or the devnet deploys no contract that raises them with revert data.
  "NameIsLocked",
  "NameRequiresMigration",
  "ParentNotMigrated",
  "NameNotLocked",
  "TransferUnsafeUntilRegistryIsEmancipated",
  "EACInvalidRoleBitmap",
  "LabelAlreadyRegistered",
  "LabelAlreadyReserved",
  "NameNotRenewable",
  "CannotSetPastExpiry",
  "InsufficientValue",
  "NotValid",
  "UnsupportedResolverProfile",
  "InvalidRecord",
  "PrimaryNameNotNormalized",
  "ReverseAddressMismatch",
  "ResolverNotContract",
  "OwnableUnauthorizedAccount",
  "WrappedOwnerMismatch",
  "PermissionDenied",
  "NotApprovedOperator",
  "CommitmentNotFound",
  "UpgradeTargetNotApproved",
];

describe("revertMap coverage", () => {
  it("documents every mapped contract error", () => {
    assert.sameMembers(Object.keys(revertMap), Object.keys(expected));
  });

  it("has each mapped error raised by a devnet contract, or listed as not yet", () => {
    const chainTest = readFileSync(
      new URL("../../../../integration/test/writes/reverts.test.ts", import.meta.url),
      "utf8",
    );
    const missing = Object.keys(revertMap).filter(
      (errorName) => !new RegExp(String.raw`\b${errorName}\b`, "u").test(chainTest),
    );
    assert.sameMembers(missing, notRaisedOnChain);
  });
});

describe("revertMap from ABI-encoded revert data", () => {
  it.each(Object.entries(expected))("%s → %o", (errorName, mapping) => {
    const encoded = overloads(errorName);

    assert.isAbove(encoded.length, 0, `${errorName} is missing from the ENS errors ABI`);
    for (const [index, data] of encoded.entries()) {
      const error = fromRevert({ data }, { operation: "test.op" });
      const arity = fragmentsOf(errorName)[index]?.inputs.length ?? 0;
      const { _tag, code } = "code" in mapping ? mapping : (mapping[arity] as Expected);

      assert.strictEqual(error._tag, _tag);
      assert.strictEqual(error.code, code);
      assert.deepStrictEqual(error.context.revert, { errorName, data });
      assert.strictEqual(error.context.operation, "test.op");
    }
  });
});

describe("revertMap fields", () => {
  it("EACUnauthorizedAccountRoles names registry roles", () => {
    const bitmap = Roles.registry.setResolver | Roles.registry.renew;
    const error = fromRevert(
      { data: encode("EACUnauthorizedAccountRoles", [1n, bitmap, account]) },
      { contractKind: "registry" },
    );

    assert.instanceOf(error, UnauthorizedError);
    assert.strictEqual(error.code, "MISSING_ROLES");
    assert.strictEqual(error.account, account);
    assert.strictEqual(error.roleBitmap, bitmap);
    assert.sameMembers([...error.missingRoles], ["setResolver", "renew"]);
  });

  it("EACCannotRevokeRoles names resolver roles", () => {
    const bitmap = Roles.resolver.setText;
    const error = fromRevert(
      { data: encode("EACCannotRevokeRoles", [1n, bitmap, account]) },
      { contractKind: "resolver" },
    );

    assert.instanceOf(error, UnauthorizedError);
    assert.deepStrictEqual(error.missingRoles, ["setText"]);
  });

  it("role names stay empty without a contract kind", () => {
    const error = fromRevert(
      { data: encode("EACUnauthorizedAccountRoles", [1n, Roles.registry.renew, account]) },
      {},
    );

    assert.instanceOf(error, UnauthorizedError);
    assert.deepStrictEqual(error.missingRoles, []);
  });

  it.each([
    { errorName: "CommitmentTooNew", field: "readyAt" },
    { errorName: "CommitmentTooOld", field: "expiresAt" },
  ])("$errorName carries the commitment and any bound as $field", ({ errorName, field }) => {
    const fragments = fragmentsOf(errorName);

    for (const fragment of fragments) {
      const bounded = fragment.inputs.length === 3;
      const data = encodeErrorResult({
        abi: [fragment],
        errorName,
        args: bounded ? [commitment, 1_700n, 1_600n] : [commitment],
      } as never);
      const error = fromRevert({ data }, {}) as unknown as Record<string, unknown>;

      assert.strictEqual(error["commitment"], commitment);
      assert.strictEqual(error[field], bounded ? 1_700n : undefined);
    }
  });

  it.each([
    { errorName: "EACInvalidRoleBitmap", args: [5n], fields: { input: 5n } },
    { errorName: "UnexpiredCommitmentExists", args: [commitment], fields: { commitment } },
    { errorName: "CommitmentNotFound", args: [commitment], fields: { commitment } },
    {
      errorName: "ERC20InsufficientBalance",
      args: [account, 3n, 10n],
      fields: { available: 3n, required: 10n },
    },
    {
      errorName: "ERC20InsufficientAllowance",
      args: [account, 1n, 9n],
      fields: {
        available: 1n,
        required: 9n,
        shortMessage: "The payment token allowance is too low.",
      },
    },
    {
      errorName: "NotValid",
      args: ["ab"],
      fields: {
        input: "ab",
        shortMessage: '"ab" cannot be registered (too short or not allowed).',
      },
    },
    {
      errorName: "PrimaryNameNotNormalized",
      args: ["Nick.eth"],
      fields: { input: "Nick.eth", field: "primary name" },
    },
  ])("$errorName copies its arguments into the error", ({ errorName, args, fields }) => {
    assert.include(fromRevert({ data: encode(errorName, args) }, {}), fields);
  });

  it.each([
    { errorName: "StorageHandledByL2", args: [8453n, account], where: `${account} on chain 8453` },
    {
      errorName: "StorageHandledByOffChainDatabase",
      args: [
        { name: "resolver", version: "1", chainId: 1n, verifyingContract: account },
        "https://gateway.example",
        {
          functionSelector: "0x10f13a8c",
          sender: account,
          parameters: [],
          expirationTimestamp: 1n,
        },
      ],
      where: "https://gateway.example",
    },
    {
      errorName: "OperationHandledOnchain",
      args: [8453n, account],
      where: `${account} on chain 8453`,
    },
    {
      errorName: "OperationHandledOffchain",
      args: [
        { name: "resolver", version: "1", chainId: 1n, verifyingContract: account },
        "https://gateway.example",
        { data: "0x", sender: account, expirationTimestamp: 1n },
      ],
      where: "https://gateway.example",
    },
  ])("$errorName says where the resolver keeps its records", ({ errorName, args, where }) => {
    const error = fromRevert({ data: encode(errorName, args) }, {});

    assert.strictEqual(error.code, "RESOLVER_PROFILE_UNSUPPORTED");
    assert.include(error.details.join("\n"), where);
  });

  it.each([
    { message: "upstream down", details: ["Gateway said: upstream down"] },
    { message: "", details: [] },
  ])("HttpError keeps the status and message $message", ({ message, details }) => {
    const error = fromRevert({ data: encode("HttpError", [503, message]) }, {});

    assert.strictEqual((error as { status?: number }).status, 503);
    assert.deepStrictEqual(error.details, details);
    assert.isTrue(error.retryable);
  });

  it.each([
    { errorName: "ResolverNotFound", args: [Name.dnsEncode("pay.nick.eth")] },
    { errorName: "ResolverNotContract", args: [Name.dnsEncode("pay.nick.eth"), account] },
    { errorName: "UnreachableName", args: [Name.dnsEncode("pay.nick.eth")] },
  ])("$errorName names the name without a resolver", ({ errorName, args }) => {
    const error = fromRevert({ data: encode(errorName, args) }, { name: "nick.eth" });

    assert.strictEqual(error.code, "RESOLVER_NOT_FOUND");
    assert.strictEqual((error as { resource?: string }).resource, "pay.nick.eth");
    assert.include(error.shortMessage, "pay.nick.eth");
  });

  it("ResolverNotFound keeps a name that is not DNS-encoded as its bytes", () => {
    const error = fromRevert({ data: encode("ResolverNotFound", ["0x0561"]) }, {});

    assert.strictEqual((error as { resource?: string }).resource, "0x0561");
  });

  it("UnsupportedResolverProfile keeps the selector of the missing profile", () => {
    const error = fromRevert({ data: encode("UnsupportedResolverProfile", ["0x3b3b57de"]) }, {});

    assert.strictEqual(error.code, "RESOLVER_PROFILE_UNSUPPORTED");
    assert.strictEqual(error.context.selector, "0x3b3b57de");
  });

  it("an unruggable verifier error is an invalid gateway response, with a hint", () => {
    const error = fromRevert(
      { data: encode("ResolverError", [encode("InvalidGameTypeBitMask", [])]) },
      {},
    );

    assert.include(error, { _tag: "GatewayError", code: "GATEWAY_RESPONSE_INVALID" });
    assert.isFalse(error.retryable);
    assert.isDefined(error.hint);
    assert.strictEqual(encode("InvalidGameTypeBitMask", []), "0xeb57ceb9");
  });

  it.each(["TransferUnsafeWithMultipleAssignees", "TransferUnsafeUntilRegistryIsEmancipated"])(
    "%s hints at unsafe transfers",
    (errorName) => {
      for (const data of overloads(errorName)) {
        assert.include(fromRevert({ data }, {}).hint, "`unsafe: true`");
      }
    },
  );
});

const lookupFrom = (sender: Hex) =>
  encode("OffchainLookup", [sender, [], "0x", "0x12345678", "0x"]);

describe("OffchainLookup reverts", () => {
  const universalResolver = getAddress("0x00000000000000000000000000000000000000b0");
  const registry = getAddress("0x00000000000000000000000000000000000000e7");

  it("means CCIP-Read is disabled when the called contract asked", () => {
    const error = fromRevert(
      { data: lookupFrom(universalResolver) },
      { contract: universalResolver },
    );
    assert.include(error, { _tag: "ConfigError", code: "CCIP_READ_DISABLED" });
  });

  // A registry's lookup under the Universal Resolver: raw on devnets, wrapped on mainnet.
  it("is an invalid lookup when another contract asked", () => {
    const raw = fromRevert({ data: lookupFrom(registry) }, { contract: universalResolver });
    const wrapped = fromRevert(
      { data: encode("ResolutionError", [registry, lookupFrom(registry)]) },
      { contract: universalResolver },
    );

    assert.include(raw, { _tag: "GatewayError", code: "OFFCHAIN_LOOKUP_INVALID" });
    assert.include(wrapped, { _tag: "GatewayError", code: "OFFCHAIN_LOOKUP_INVALID" });
    assert.strictEqual(wrapped.context.registry, registry);
  });
});

const requireRevert = (message: string): Hex =>
  encodeErrorResult({
    abi: parseAbi(["error Error(string)"]),
    errorName: "Error",
    args: [message],
  });

describe("ENSv1 require messages", () => {
  it.each([
    ["ERC721: approve caller is not token owner or approved for all", "NOT_OWNER"],
    ["ERC721: caller is not token owner or approved", "NOT_OWNER"],
    [
      "ReverseRegistrar: Caller is not a controller or authorised by address or the address itself",
      "NOT_APPROVED",
    ],
  ])("%s → %s", (message, code) => {
    const error = fromRevert({ data: requireRevert(message) }, {});
    assert.include(error, { _tag: "UnauthorizedError", code });
  });

  it("leaves other messages as a contract revert", () => {
    const error = fromRevert({ data: requireRevert("something else") }, {});
    assert.include(error, { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" });
  });
});

describe("batch gateway failures", () => {
  // viem's local batch gateway encodes these failed requests as `Error(string)`.
  it.each([
    ["HTTP request failed.", "GATEWAY_REQUEST_FAILED"],
    ["The request took too long to respond.", "GATEWAY_REQUEST_FAILED"],
    [
      "Offchain gateway response is malformed. Response data must be a hex value.",
      "GATEWAY_RESPONSE_INVALID",
    ],
  ])("%s → %s", (message, code) => {
    const error = fromRevert({ data: requireRevert(message) }, {});
    assert.include(error, { _tag: "GatewayError", code });
  });
});
