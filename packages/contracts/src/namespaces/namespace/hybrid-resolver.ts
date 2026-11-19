/**
 * Complete NamespaceHybridResolver ABI: the Ethereum resolver of Namespace parent names; `configs(node)` names the chain of their subnames.
 *
 * @see https://repo.sourcify.dev/1/0xe5A0277018879679d18cCDb66B52BD06f7fE95FD
 * @stability stable
 * @since 1.1.0
 */
export const namespaceHybridResolverAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_signers",
        type: "address[]",
        internalType: "address[]",
      },
      {
        name: "ens",
        type: "address",
        internalType: "address",
      },
      {
        name: "nameWrapper",
        type: "address",
        internalType: "address",
      },
      {
        name: "_fallbackResolver",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    name: "ECDSAInvalidSignature",
    type: "error",
    inputs: [],
  },
  {
    name: "ECDSAInvalidSignatureLength",
    type: "error",
    inputs: [
      {
        name: "length",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    name: "ECDSAInvalidSignatureS",
    type: "error",
    inputs: [
      {
        name: "s",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
  },
  {
    name: "OffchainLookup",
    type: "error",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address",
      },
      {
        name: "urls",
        type: "string[]",
        internalType: "string[]",
      },
      {
        name: "callData",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "callbackFunction",
        type: "bytes4",
        internalType: "bytes4",
      },
      {
        name: "extraData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
  },
  {
    name: "OwnableInvalidOwner",
    type: "error",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "OwnableUnauthorizedAccount",
    type: "error",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "ABIChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "contentType",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    name: "AddrChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "a",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "AddressChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "coinType",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "newAddress",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    name: "ContenthashChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "hash",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    name: "FallbackResolverSet",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "newResolver",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "InterfaceChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "interfaceID",
        type: "bytes4",
        indexed: true,
        internalType: "bytes4",
      },
      {
        name: "implementer",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "NameChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "name",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    name: "OffchainUrlsChanged",
    type: "event",
    inputs: [
      {
        name: "urls",
        type: "string[]",
        indexed: false,
        internalType: "string[]",
      },
    ],
    anonymous: false,
  },
  {
    name: "OwnershipTransferred",
    type: "event",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "ResolutionConfigChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "prevType",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "newType",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    name: "ResolutionUrlsChanged",
    type: "event",
    inputs: [
      {
        name: "resolutionType",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "urls",
        type: "string[]",
        indexed: false,
        internalType: "string[]",
      },
    ],
    anonymous: false,
  },
  {
    name: "SignerChanged",
    type: "event",
    inputs: [
      {
        name: "signer",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "removed",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    name: "TextChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "indexedKey",
        type: "string",
        indexed: true,
        internalType: "string",
      },
      {
        name: "key",
        type: "string",
        indexed: false,
        internalType: "string",
      },
      {
        name: "value",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    name: "VersionChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "newVersion",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
    ],
    anonymous: false,
  },
  {
    name: "ABI",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "contentTypes",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "addr",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address payable",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "addr",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "coinType",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "clearRecords",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "configs",
    type: "function",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "resolveOffchain",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "resolutionType",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "contenthash",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "defaultFallbackResolver",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "fallbackResolvers",
    type: "function",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "interfaceImplementer",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "interfaceID",
        type: "bytes4",
        internalType: "bytes4",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "modifyOffchainSigners",
    type: "function",
    inputs: [
      {
        name: "_signers",
        type: "address[]",
        internalType: "address[]",
      },
      {
        name: "remove",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "multicall",
    type: "function",
    inputs: [
      {
        name: "data",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [
      {
        name: "results",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    name: "multicallWithNodeCheck",
    type: "function",
    inputs: [
      {
        name: "nodehash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "data",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [
      {
        name: "results",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    name: "name",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "owner",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "recordVersions",
    type: "function",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "renounceOwnership",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "resolutionUrls",
    type: "function",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "resolve",
    type: "function",
    inputs: [
      {
        name: "dnsName",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "resolveWithProof",
    type: "function",
    inputs: [
      {
        name: "response",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "extraData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "setABI",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "contentType",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setAddr",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "coinType",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "a",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setAddr",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "a",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setContenthash",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "hash",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setDefaultFallbackResolver",
    type: "function",
    inputs: [
      {
        name: "_fallbackResolver",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setEmptyResponse",
    type: "function",
    inputs: [
      {
        name: "hash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "value",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setFallbackResolver",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "fallbackResolver",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setInterface",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "interfaceID",
        type: "bytes4",
        internalType: "bytes4",
      },
      {
        name: "implementer",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setName",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "newName",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setResolutionType",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "newResolutionType",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setResolutionUrls",
    type: "function",
    inputs: [
      {
        name: "resolutionType",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "urls",
        type: "string[]",
        internalType: "string[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setSupportedResolutionType",
    type: "function",
    inputs: [
      {
        name: "resolutionType",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "supported",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setText",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "key",
        type: "string",
        internalType: "string",
      },
      {
        name: "value",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "supportsInterface",
    type: "function",
    inputs: [
      {
        name: "interfaceId",
        type: "bytes4",
        internalType: "bytes4",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "text",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "key",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "transferOwnership",
    type: "function",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
