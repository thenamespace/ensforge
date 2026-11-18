/**
 * The ENS events indexers consume, across ENSv1 and ENSv2: registry, registrar, NameWrapper,
 * resolver, reverse and DNS registrar events, following the ENSv2 indexing guide. Generated from
 * the contract ABIs (one entry per topic), plus the legacy `ContentChanged`.
 *
 * @stability stable
 * @since 1.0.0
 */
export const ensEventsAbi = [
  {
    type: "event",
    name: "NewOwner",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "label",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "owner",
        type: "address",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "owner",
        type: "address",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NewResolver",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "resolver",
        type: "address",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "ApprovalForAll",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
      },
      {
        name: "operator",
        type: "address",
        indexed: true,
      },
      {
        name: "approved",
        type: "bool",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameRegistered",
    inputs: [
      {
        name: "id",
        type: "uint256",
        indexed: true,
      },
      {
        name: "owner",
        type: "address",
        indexed: true,
      },
      {
        name: "expires",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameRenewed",
    inputs: [
      {
        name: "id",
        type: "uint256",
        indexed: true,
      },
      {
        name: "expires",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
      },
      {
        name: "to",
        type: "address",
        indexed: true,
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "NameMigrated",
    inputs: [
      {
        name: "id",
        type: "uint256",
        indexed: true,
      },
      {
        name: "owner",
        type: "address",
        indexed: true,
      },
      {
        name: "expires",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameRegistered",
    inputs: [
      {
        name: "label",
        type: "string",
        indexed: false,
      },
      {
        name: "labelhash",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "owner",
        type: "address",
        indexed: true,
      },
      {
        name: "baseCost",
        type: "uint256",
        indexed: false,
      },
      {
        name: "premium",
        type: "uint256",
        indexed: false,
      },
      {
        name: "expires",
        type: "uint256",
        indexed: false,
      },
      {
        name: "referrer",
        type: "bytes32",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameRenewed",
    inputs: [
      {
        name: "label",
        type: "string",
        indexed: false,
      },
      {
        name: "labelhash",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "cost",
        type: "uint256",
        indexed: false,
      },
      {
        name: "expires",
        type: "uint256",
        indexed: false,
      },
      {
        name: "referrer",
        type: "bytes32",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameRegistered",
    inputs: [
      {
        name: "name",
        type: "string",
        indexed: false,
      },
      {
        name: "label",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "owner",
        type: "address",
        indexed: true,
      },
      {
        name: "baseCost",
        type: "uint256",
        indexed: false,
      },
      {
        name: "premium",
        type: "uint256",
        indexed: false,
      },
      {
        name: "expires",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameRenewed",
    inputs: [
      {
        name: "name",
        type: "string",
        indexed: false,
      },
      {
        name: "label",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "cost",
        type: "uint256",
        indexed: false,
      },
      {
        name: "expires",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameWrapped",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "name",
        type: "bytes",
        indexed: false,
      },
      {
        name: "owner",
        type: "address",
        indexed: false,
      },
      {
        name: "fuses",
        type: "uint32",
        indexed: false,
      },
      {
        name: "expiry",
        type: "uint64",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameUnwrapped",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "owner",
        type: "address",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "FusesSet",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "fuses",
        type: "uint32",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "ExpiryExtended",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "expiry",
        type: "uint64",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "TransferSingle",
    inputs: [
      {
        name: "operator",
        type: "address",
        indexed: true,
      },
      {
        name: "from",
        type: "address",
        indexed: true,
      },
      {
        name: "to",
        type: "address",
        indexed: true,
      },
      {
        name: "id",
        type: "uint256",
        indexed: false,
      },
      {
        name: "value",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "TransferBatch",
    inputs: [
      {
        name: "operator",
        type: "address",
        indexed: true,
      },
      {
        name: "from",
        type: "address",
        indexed: true,
      },
      {
        name: "to",
        type: "address",
        indexed: true,
      },
      {
        name: "ids",
        type: "uint256[]",
        indexed: false,
      },
      {
        name: "values",
        type: "uint256[]",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "AddrChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "a",
        type: "address",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "AddressChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "coinType",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newAddress",
        type: "bytes",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "TextChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "indexedKey",
        type: "string",
        indexed: true,
      },
      {
        name: "key",
        type: "string",
        indexed: false,
      },
      {
        name: "value",
        type: "string",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "ContenthashChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "hash",
        type: "bytes",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "ABIChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "contentType",
        type: "uint256",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "InterfaceChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "interfaceID",
        type: "bytes4",
        indexed: true,
      },
      {
        name: "implementer",
        type: "address",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "name",
        type: "string",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "PubkeyChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "x",
        type: "bytes32",
        indexed: false,
      },
      {
        name: "y",
        type: "bytes32",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "DataChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "indexedKey",
        type: "string",
        indexed: true,
      },
      {
        name: "key",
        type: "string",
        indexed: false,
      },
      {
        name: "indexedData",
        type: "bytes",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "VersionChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "newVersion",
        type: "uint64",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Approved",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: false,
      },
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "delegate",
        type: "address",
        indexed: true,
      },
      {
        name: "approved",
        type: "bool",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "ReverseClaimed",
    inputs: [
      {
        name: "addr",
        type: "address",
        indexed: true,
      },
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "NameForAddrChanged",
    inputs: [
      {
        name: "addr",
        type: "address",
        indexed: true,
      },
      {
        name: "name",
        type: "string",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Claim",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "owner",
        type: "address",
        indexed: true,
      },
      {
        name: "dnsname",
        type: "bytes",
        indexed: false,
      },
      {
        name: "inception",
        type: "uint32",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "LabelRegistered",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "labelHash",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "label",
        type: "string",
        indexed: false,
      },
      {
        name: "owner",
        type: "address",
        indexed: false,
      },
      {
        name: "expiry",
        type: "uint64",
        indexed: false,
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "LabelReserved",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "labelHash",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "label",
        type: "string",
        indexed: false,
      },
      {
        name: "expiry",
        type: "uint64",
        indexed: false,
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "LabelUnregistered",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "ExpiryUpdated",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "newExpiry",
        type: "uint64",
        indexed: true,
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "SubregistryUpdated",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "subregistry",
        type: "address",
        indexed: true,
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "ResolverUpdated",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "resolver",
        type: "address",
        indexed: true,
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "TokenRegenerated",
    inputs: [
      {
        name: "oldTokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "newTokenId",
        type: "uint256",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "TokenResource",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "resource",
        type: "uint256",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "ParentUpdated",
    inputs: [
      {
        name: "parent",
        type: "address",
        indexed: true,
      },
      {
        name: "label",
        type: "string",
        indexed: false,
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "RegistryCreated",
    inputs: [],
  },
  {
    type: "event",
    name: "EACRolesChanged",
    inputs: [
      {
        name: "resource",
        type: "uint256",
        indexed: true,
      },
      {
        name: "account",
        type: "address",
        indexed: true,
      },
      {
        name: "oldRoleBitmap",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newRoleBitmap",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Upgraded",
    inputs: [
      {
        name: "implementation",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "NameRegistered",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "label",
        type: "string",
        indexed: false,
      },
      {
        name: "owner",
        type: "address",
        indexed: false,
      },
      {
        name: "subregistry",
        type: "address",
        indexed: false,
      },
      {
        name: "resolver",
        type: "address",
        indexed: false,
      },
      {
        name: "duration",
        type: "uint64",
        indexed: false,
      },
      {
        name: "paymentToken",
        type: "address",
        indexed: false,
      },
      {
        name: "referrer",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "base",
        type: "uint256",
        indexed: false,
      },
      {
        name: "premium",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameRenewed",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "label",
        type: "string",
        indexed: false,
      },
      {
        name: "duration",
        type: "uint64",
        indexed: false,
      },
      {
        name: "newExpiry",
        type: "uint64",
        indexed: false,
      },
      {
        name: "paymentToken",
        type: "address",
        indexed: false,
      },
      {
        name: "referrer",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "AddressUpdated",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "coinType",
        type: "uint256",
        indexed: false,
      },
      {
        name: "addressBytes",
        type: "bytes",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "TextUpdated",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "keyHash",
        type: "string",
        indexed: true,
      },
      {
        name: "key",
        type: "string",
        indexed: false,
      },
      {
        name: "value",
        type: "string",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "ContenthashUpdated",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "hash",
        type: "bytes",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "ABIUpdated",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "contentType",
        type: "uint256",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "InterfaceUpdated",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "interfaceId",
        type: "bytes4",
        indexed: true,
      },
      {
        name: "implementer",
        type: "address",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "NameUpdated",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "primaryName",
        type: "string",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "DataUpdated",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "keyHash",
        type: "string",
        indexed: true,
      },
      {
        name: "key",
        type: "string",
        indexed: false,
      },
      {
        name: "value",
        type: "bytes",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Linked",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "name",
        type: "bytes",
        indexed: false,
      },
    ],
  },
  {
    type: "event",
    name: "Cleared",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "ContentChanged",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "hash",
        type: "bytes32",
        indexed: false,
      },
    ],
  },
] as const;
