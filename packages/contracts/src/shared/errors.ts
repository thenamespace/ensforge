/**
 * Every custom error of the ENS contracts in this package (ENSv1 ens-contracts v1.7.0 and
 * ENSv2 contracts-v2 v1.0.1, with mainnet's UserRegistry from `post-audit-2`), plus the OpenZeppelin `IERC20Errors` that ERC-20 payment tokens
 * raise, the verifiable proxy's `InvalidUpgradeTarget`, the HCA's `NoNFTAllowed` (raised when a
 * name token is sent to a Hosted Contract Account), the errors with which resolvers that keep
 * their records elsewhere refuse on-chain writes (ERC-5559 `StorageHandledBy…`, ERC-7884
 * `OperationHandled…`) and the verifier and fetcher errors of unruggable gateways, which the L2
 * reverse resolvers raise for a proof that does not verify. Use it to decode a revert from any ENS
 * call.
 *
 * Generated from the ABIs of this package; regenerate when they change.
 *
 * @stability stable
 * @since 1.0.0
 */
export const ensErrorsAbi = [
  {
    type: "error",
    name: "AddressEmptyCode",
    inputs: [
      {
        name: "target",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "CallerNotAdmin",
    inputs: [],
  },
  {
    type: "error",
    name: "CannotReduceExpiry",
    inputs: [
      {
        name: "oldExpiry",
        type: "uint64",
      },
      {
        name: "newExpiry",
        type: "uint64",
      },
    ],
  },
  {
    type: "error",
    name: "CannotSetPastExpiry",
    inputs: [
      {
        name: "expiry",
        type: "uint64",
      },
    ],
  },
  {
    type: "error",
    name: "CannotUpgrade",
    inputs: [],
  },
  {
    type: "error",
    name: "CoinTypeNotFound",
    inputs: [],
  },
  {
    type: "error",
    name: "CommitmentNotFound",
    inputs: [
      {
        name: "commitment",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "CommitmentTooNew",
    inputs: [
      {
        name: "commitment",
        type: "bytes32",
      },
      {
        name: "minimumCommitmentTimestamp",
        type: "uint256",
      },
      {
        name: "currentTimestamp",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "CommitmentTooNew",
    inputs: [
      {
        name: "commitment",
        type: "bytes32",
      },
      {
        name: "validFrom",
        type: "uint64",
      },
      {
        name: "blockTimestamp",
        type: "uint64",
      },
    ],
  },
  {
    type: "error",
    name: "CommitmentTooNew",
    inputs: [
      {
        name: "commitment",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "CommitmentTooOld",
    inputs: [
      {
        name: "commitment",
        type: "bytes32",
      },
      {
        name: "maximumCommitmentTimestamp",
        type: "uint256",
      },
      {
        name: "currentTimestamp",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "CommitmentTooOld",
    inputs: [
      {
        name: "commitment",
        type: "bytes32",
      },
      {
        name: "validTo",
        type: "uint64",
      },
      {
        name: "blockTimestamp",
        type: "uint64",
      },
    ],
  },
  {
    type: "error",
    name: "CommitmentTooOld",
    inputs: [
      {
        name: "commitment",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "CouldNotResolve",
    inputs: [
      {
        name: "name",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "DNSDecodingFailed",
    inputs: [
      {
        name: "dns",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "DNSEncodingFailed",
    inputs: [
      {
        name: "ens",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "DurationTooShort",
    inputs: [
      {
        name: "duration",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "DurationTooShort",
    inputs: [
      {
        name: "duration",
        type: "uint64",
      },
      {
        name: "minDuration",
        type: "uint64",
      },
    ],
  },
  {
    type: "error",
    name: "EACCannotGrantRoles",
    inputs: [
      {
        name: "resource",
        type: "uint256",
      },
      {
        name: "roleBitmap",
        type: "uint256",
      },
      {
        name: "account",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "EACCannotRevokeRoles",
    inputs: [
      {
        name: "resource",
        type: "uint256",
      },
      {
        name: "roleBitmap",
        type: "uint256",
      },
      {
        name: "account",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "EACInvalidAccount",
    inputs: [],
  },
  {
    type: "error",
    name: "EACInvalidRoleBitmap",
    inputs: [
      {
        name: "roleBitmap",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "EACMaxAssignees",
    inputs: [
      {
        name: "resource",
        type: "uint256",
      },
      {
        name: "role",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "EACMinAssignees",
    inputs: [
      {
        name: "resource",
        type: "uint256",
      },
      {
        name: "role",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "EACRootResourceNotAllowed",
    inputs: [],
  },
  {
    type: "error",
    name: "EACUnauthorizedAccountRoles",
    inputs: [
      {
        name: "resource",
        type: "uint256",
      },
      {
        name: "roleBitmap",
        type: "uint256",
      },
      {
        name: "account",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "EmptyAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "ERC1155InsufficientBalance",
    inputs: [
      {
        name: "sender",
        type: "address",
      },
      {
        name: "balance",
        type: "uint256",
      },
      {
        name: "needed",
        type: "uint256",
      },
      {
        name: "tokenId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidApprover",
    inputs: [
      {
        name: "approver",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidArrayLength",
    inputs: [
      {
        name: "idsLength",
        type: "uint256",
      },
      {
        name: "valuesLength",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidOperator",
    inputs: [
      {
        name: "operator",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidReceiver",
    inputs: [
      {
        name: "receiver",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidSender",
    inputs: [
      {
        name: "sender",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155MissingApprovalForAll",
    inputs: [
      {
        name: "operator",
        type: "address",
      },
      {
        name: "owner",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1967InvalidImplementation",
    inputs: [
      {
        name: "implementation",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1967NonPayable",
    inputs: [],
  },
  {
    type: "error",
    name: "FailedCall",
    inputs: [],
  },
  {
    type: "error",
    name: "FrozenTokenApproval",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "HCADeploymentNotTrusted",
    inputs: [
      {
        name: "hca",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "HCAOwnerMismatch",
    inputs: [
      {
        name: "account",
        type: "address",
      },
      {
        name: "hcaOwner",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "HttpError",
    inputs: [
      {
        name: "status",
        type: "uint16",
      },
      {
        name: "message",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "IncompatibleParent",
    inputs: [],
  },
  {
    type: "error",
    name: "IncorrectTargetOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "IncorrectTokenType",
    inputs: [],
  },
  {
    type: "error",
    name: "InputLengthMismatch",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientValue",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidBaseRates",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidBatchGatewayResponse",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidClass",
    inputs: [
      {
        name: "class",
        type: "uint16",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidContentType",
    inputs: [
      {
        name: "contentType",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidData",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidDataLength",
    inputs: [
      {
        name: "data",
        type: "bytes",
      },
      {
        name: "expected",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidDiscount",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidEVMAddress",
    inputs: [
      {
        name: "addressBytes",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidHexData",
    inputs: [
      {
        name: "data",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidImplementation",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidInitialization",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidLabelCount",
    inputs: [
      {
        name: "name",
        type: "bytes",
      },
      {
        name: "labelsExpected",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidOffchainLookup",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidOperation",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidOwner",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidProofType",
    inputs: [
      {
        name: "proofType",
        type: "uint16",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidPublicSuffix",
    inputs: [
      {
        name: "name",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidRatio",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidRecord",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidRRSet",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSignature",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSignerName",
    inputs: [
      {
        name: "rrsetName",
        type: "bytes",
      },
      {
        name: "signerName",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidTXT",
    inputs: [],
  },
  {
    type: "error",
    name: "LabelAlreadyRegistered",
    inputs: [
      {
        name: "label",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "LabelAlreadyReserved",
    inputs: [
      {
        name: "label",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "LabelExpired",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "LabelIsEmpty",
    inputs: [],
  },
  {
    type: "error",
    name: "LabelIsTooLong",
    inputs: [
      {
        name: "label",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "LabelMismatch",
    inputs: [
      {
        name: "labelHash",
        type: "bytes32",
      },
      {
        name: "expectedLabelhash",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "LabelTooLong",
    inputs: [
      {
        name: "label",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "LabelTooShort",
    inputs: [],
  },
  {
    type: "error",
    name: "MaxCommitmentAgeTooHigh",
    inputs: [],
  },
  {
    type: "error",
    name: "MaxCommitmentAgeTooLow",
    inputs: [],
  },
  {
    type: "error",
    name: "NameDataMismatch",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NameIsLocked",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NameIsNotWrapped",
    inputs: [],
  },
  {
    type: "error",
    name: "NameNotAvailable",
    inputs: [
      {
        name: "name",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "NameNotClearable",
    inputs: [],
  },
  {
    type: "error",
    name: "NameNotLocked",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NameNotRenewable",
    inputs: [
      {
        name: "label",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "NameRequiresMigration",
    inputs: [],
  },
  {
    type: "error",
    name: "NameRequiresPreimage",
    inputs: [],
  },
  {
    type: "error",
    name: "NestedUpgradeNotAllowed",
    inputs: [],
  },
  {
    type: "error",
    name: "NoMatchingProof",
    inputs: [
      {
        name: "signerName",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "NoNFTAllowed",
    inputs: [],
  },
  {
    type: "error",
    name: "NoOwnerRecordFound",
    inputs: [],
  },
  {
    type: "error",
    name: "NormalizationChangedName",
    inputs: [
      {
        name: "normalizedName",
        type: "bytes",
      },
      {
        name: "result",
        type: "bytes",
      },
      {
        name: "resolver",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "NoSuffixMatch",
    inputs: [
      {
        name: "name",
        type: "bytes",
      },
      {
        name: "suffix",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "NotApprovedOperator",
    inputs: [
      {
        name: "nft",
        type: "address",
      },
      {
        name: "owner",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "NotInitializing",
    inputs: [],
  },
  {
    type: "error",
    name: "NotOwnerOfContract",
    inputs: [],
  },
  {
    type: "error",
    name: "NotValid",
    inputs: [
      {
        name: "label",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "OffchainLookup",
    inputs: [
      {
        name: "sender",
        type: "address",
      },
      {
        name: "urls",
        type: "string[]",
      },
      {
        name: "callData",
        type: "bytes",
      },
      {
        name: "callbackFunction",
        type: "bytes4",
      },
      {
        name: "extraData",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "OffsetOutOfBoundsError",
    inputs: [
      {
        name: "offset",
        type: "uint256",
      },
      {
        name: "length",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "OperationProhibited",
    inputs: [
      {
        name: "node",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ParentNotMigrated",
    inputs: [
      {
        name: "name",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "PaymentTokenNotSupported",
    inputs: [
      {
        name: "paymentToken",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "PermissionDenied",
    inputs: [
      {
        name: "caller",
        type: "address",
      },
      {
        name: "owner",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "PreconditionNotMet",
    inputs: [],
  },
  {
    type: "error",
    name: "PrimaryNameNotNormalized",
    inputs: [
      {
        name: "primary",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "ProofNameMismatch",
    inputs: [
      {
        name: "signerName",
        type: "bytes",
      },
      {
        name: "proofName",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "ResolutionError",
    inputs: [
      {
        name: "registry",
        type: "address",
      },
      {
        name: "errorData",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "ResolverError",
    inputs: [
      {
        name: "errorData",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "ResolverNotContract",
    inputs: [
      {
        name: "name",
        type: "bytes",
      },
      {
        name: "resolver",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ResolverNotFound",
    inputs: [
      {
        name: "name",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "ResolverRequiredForReverseRecord",
    inputs: [],
  },
  {
    type: "error",
    name: "ResolverRequiredWhenDataSupplied",
    inputs: [],
  },
  {
    type: "error",
    name: "ReverseAddressMismatch",
    inputs: [
      {
        name: "primary",
        type: "string",
      },
      {
        name: "primaryAddress",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "SafeERC20FailedOperation",
    inputs: [
      {
        name: "token",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "SameImplementation",
    inputs: [],
  },
  {
    type: "error",
    name: "SignatureExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "SignatureExpired",
    inputs: [
      {
        name: "expiration",
        type: "uint32",
      },
      {
        name: "now",
        type: "uint32",
      },
    ],
  },
  {
    type: "error",
    name: "SignatureExpiryTooHigh",
    inputs: [],
  },
  {
    type: "error",
    name: "SignatureNotValidYet",
    inputs: [
      {
        name: "inception",
        type: "uint32",
      },
      {
        name: "now",
        type: "uint32",
      },
    ],
  },
  {
    type: "error",
    name: "SignatureTypeMismatch",
    inputs: [
      {
        name: "rrsetType",
        type: "uint16",
      },
      {
        name: "sigType",
        type: "uint16",
      },
    ],
  },
  {
    type: "error",
    name: "StaleProof",
    inputs: [],
  },
  {
    type: "error",
    name: "TLDNotPublic",
    inputs: [
      {
        name: "label",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "TransferDisallowed",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
      },
      {
        name: "from",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "TransferUnsafeUntilRegistryIsEmancipated",
    inputs: [],
  },
  {
    type: "error",
    name: "TransferUnsafeWithMultipleAssignees",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
      },
      {
        name: "from",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "Unauthorised",
    inputs: [],
  },
  {
    type: "error",
    name: "Unauthorised",
    inputs: [
      {
        name: "node",
        type: "bytes32",
      },
      {
        name: "addr",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "UnauthorizedCaller",
    inputs: [
      {
        name: "caller",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "UnauthorizedNamer",
    inputs: [
      {
        name: "namer",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "UnexpiredCommitmentExists",
    inputs: [
      {
        name: "commitment",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "UnreachableName",
    inputs: [
      {
        name: "name",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "UnsafeBatchGatewayResponse",
    inputs: [
      {
        name: "",
        type: "bytes",
      },
    ],
  },
  {
    type: "error",
    name: "UnsupportedResolverProfile",
    inputs: [
      {
        name: "selector",
        type: "bytes4",
      },
    ],
  },
  {
    type: "error",
    name: "UpgradeTargetNotApproved",
    inputs: [
      {
        name: "implementation",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "UUPSUnauthorizedCallContext",
    inputs: [],
  },
  {
    type: "error",
    name: "UUPSUnsupportedProxiableUUID",
    inputs: [
      {
        name: "slot",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "VerificationFailed",
    inputs: [
      {
        name: "proxy",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "WrappedOwnerMismatch",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      {
        name: "spender",
        type: "address",
      },
      {
        name: "allowance",
        type: "uint256",
      },
      {
        name: "needed",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      {
        name: "sender",
        type: "address",
      },
      {
        name: "balance",
        type: "uint256",
      },
      {
        name: "needed",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ERC20InvalidApprover",
    inputs: [
      {
        name: "approver",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC20InvalidReceiver",
    inputs: [
      {
        name: "receiver",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC20InvalidSender",
    inputs: [
      {
        name: "sender",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC20InvalidSpender",
    inputs: [
      {
        name: "spender",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidUpgradeTarget",
    inputs: [
      {
        name: "currentImplementation",
        type: "address",
      },
      {
        name: "newImplementation",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "StorageHandledByL2",
    inputs: [
      { name: "chainId", type: "uint256" },
      { name: "contractAddress", type: "address" },
    ],
  },
  {
    type: "error",
    name: "StorageHandledByOffChainDatabase",
    inputs: [
      {
        name: "sender",
        type: "tuple",
        internalType: "struct IWriteDeferral.domainData",
        components: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint64" },
          { name: "verifyingContract", type: "address" },
        ],
      },
      { name: "url", type: "string" },
      {
        name: "data",
        type: "tuple",
        internalType: "struct IWriteDeferral.messageData",
        components: [
          { name: "functionSelector", type: "bytes4" },
          { name: "sender", type: "address" },
          {
            name: "parameters",
            type: "tuple[]",
            internalType: "struct IWriteDeferral.parameter[]",
            components: [
              { name: "name", type: "string" },
              { name: "value", type: "string" },
            ],
          },
          { name: "expirationTimestamp", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "error",
    name: "OperationHandledOnchain",
    inputs: [
      { name: "chainId", type: "uint256" },
      { name: "contractAddress", type: "address" },
    ],
  },
  {
    type: "error",
    name: "OperationHandledOffchain",
    inputs: [
      {
        name: "sender",
        type: "tuple",
        internalType: "struct DomainData",
        components: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint64" },
          { name: "verifyingContract", type: "address" },
        ],
      },
      { name: "url", type: "string" },
      {
        name: "data",
        type: "tuple",
        internalType: "struct MessageData",
        components: [
          { name: "data", type: "bytes" },
          { name: "sender", type: "address" },
          { name: "expirationTimestamp", type: "uint256" },
        ],
      },
    ],
  },
  // Errors declared in the contracts of `@unruggable/gateways` 1.3.0, the version ens-contracts
  // pins (npm integrity sha512-+dlrwk9RioP57/QlrAB85noI+t6vQ0avpO8DjDGeW9FP4HzPJNzsVZdEcvfOEgDW
  // VVDrlh3S1EOCNguGivOPEg==), less its admin errors: the L2 reverse resolvers' verifiers and
  // fetchers raise them when a gateway's proof of L2 state does not verify.
  // `InvalidGameTypeBitMask()` (0xeb57ceb9) is not in 1.3.0; Base's deployed verifier raises it.
  {
    type: "error",
    name: "CommitTooOld",
    inputs: [
      { name: "latest", type: "uint256" },
      { name: "got", type: "uint256" },
      { name: "window", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "CommitTooNew",
    inputs: [
      { name: "latest", type: "uint256" },
      { name: "got", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "InvalidProof",
    inputs: [],
  },
  {
    type: "error",
    name: "GameNotFound",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidGameTypeBitMask",
    inputs: [],
  },
  {
    type: "error",
    name: "OutputNotFound",
    inputs: [],
  },
  {
    type: "error",
    name: "TooManyProofs",
    inputs: [{ name: "max", type: "uint256" }],
  },
  {
    type: "error",
    name: "RequestOverflow",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidRequest",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidStackIndex",
    inputs: [
      { name: "index", type: "uint256" },
      { name: "count", type: "uint256" },
      { name: "reversed", type: "bool" },
    ],
  },
  {
    type: "error",
    name: "InvalidOutputIndex",
    inputs: [
      { name: "index", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "StackOverflow",
    inputs: [],
  },
  {
    type: "error",
    name: "DataMissing",
    inputs: [],
  },
  {
    type: "error",
    name: "DataIsNotMod32",
    inputs: [],
  },
  {
    type: "error",
    name: "LengthNotMod32",
    inputs: [],
  },
  {
    type: "error",
    name: "MaxTreeLeafIndexExceed",
    inputs: [],
  },
  {
    type: "error",
    name: "WrongBytesLength",
    inputs: [
      { name: "expectedLength", type: "uint256" },
      { name: "bytesLength", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "WrongProofLength",
    inputs: [
      { name: "expectedLength", type: "uint256" },
      { name: "actualLength", type: "uint256" },
    ],
  },
] as const;
