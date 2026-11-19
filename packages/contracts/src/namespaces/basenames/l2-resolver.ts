/**
 * Complete UpgradeableL2Resolver ABI: the resolver of Basenames on Base. The legacy `L2Resolver` exposes the same resolver profiles.
 *
 * @see https://repo.sourcify.dev/8453/0xf74b949f2105178eEEd4Ef35a131715E967337ab
 * @stability stable
 * @since 1.1.0
 */
export const basenamesL2ResolverAbi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "CantSetSelfAsDelegate",
    type: "error",
    inputs: [],
  },
  {
    name: "CantSetSelfAsOperator",
    type: "error",
    inputs: [],
  },
  {
    name: "InvalidBytesLength",
    type: "error",
    inputs: [],
  },
  {
    name: "InvalidContentType",
    type: "error",
    inputs: [],
  },
  {
    name: "InvalidEVMAddress",
    type: "error",
    inputs: [
      {
        name: "a",
        type: "bytes",
        internalType: "bytes",
      },
    ],
  },
  {
    name: "InvalidInitialization",
    type: "error",
    inputs: [],
  },
  {
    name: "NoZeroAddress",
    type: "error",
    inputs: [],
  },
  {
    name: "NotAuthorized",
    type: "error",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "caller",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "NotInitializing",
    type: "error",
    inputs: [],
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
    name: "ApprovalForAll",
    type: "event",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "operator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "approved",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    name: "Approved",
    type: "event",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "delegate",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "approved",
        type: "bool",
        indexed: true,
        internalType: "bool",
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
    name: "ControllerApprovalChanged",
    type: "event",
    inputs: [
      {
        name: "controller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "approved",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    name: "DNSRecordChanged",
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
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "resource",
        type: "uint16",
        indexed: false,
        internalType: "uint16",
      },
      {
        name: "record",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    name: "DNSRecordDeleted",
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
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "resource",
        type: "uint16",
        indexed: false,
        internalType: "uint16",
      },
    ],
    anonymous: false,
  },
  {
    name: "DNSZonehashChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "lastzonehash",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "zonehash",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    name: "Initialized",
    type: "event",
    inputs: [
      {
        name: "version",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
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
    name: "OwnershipTransferStarted",
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
    name: "PubkeyChanged",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "x",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "y",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    name: "ReverseRegistrarUpdated",
    type: "event",
    inputs: [
      {
        name: "newReverseRegistrar",
        type: "address",
        indexed: true,
        internalType: "address",
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
    name: "acceptOwnership",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
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
        name: "addressBytes",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "delegate",
        type: "address",
        internalType: "address",
      },
      {
        name: "approved",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
    name: "dnsRecord",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "name",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "resource",
        type: "uint16",
        internalType: "uint16",
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
    name: "getControllerApproval",
    type: "function",
    inputs: [
      {
        name: "controller",
        type: "address",
        internalType: "address",
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
    name: "hasDNSRecords",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "name",
        type: "bytes32",
        internalType: "bytes32",
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
    name: "initialize",
    type: "function",
    inputs: [
      {
        name: "registry_",
        type: "address",
        internalType: "contract ENS",
      },
      {
        name: "registrarController_",
        type: "address",
        internalType: "address",
      },
      {
        name: "reverseRegistrar_",
        type: "address",
        internalType: "address",
      },
      {
        name: "owner_",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
    name: "isApprovedFor",
    type: "function",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "delegate",
        type: "address",
        internalType: "address",
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
    name: "isApprovedForAll",
    type: "function",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
      {
        name: "operator",
        type: "address",
        internalType: "address",
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
    name: "pendingOwner",
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
    name: "pubkey",
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
        name: "x",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "y",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "recordVersions",
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
    name: "resolve",
    type: "function",
    inputs: [
      {
        name: "",
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
    name: "reverseRegistrar",
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
    name: "setApprovalForAll",
    type: "function",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address",
      },
      {
        name: "approved",
        type: "bool",
        internalType: "bool",
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
    name: "setControllerApproval",
    type: "function",
    inputs: [
      {
        name: "controller",
        type: "address",
        internalType: "address",
      },
      {
        name: "approved",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setDNSRecords",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
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
    name: "setPubkey",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "x",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "y",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setReverseRegistrar",
    type: "function",
    inputs: [
      {
        name: "reverseRegistrar_",
        type: "address",
        internalType: "address",
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
    name: "setZonehash",
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
    name: "supportsInterface",
    type: "function",
    inputs: [
      {
        name: "interfaceID",
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
  {
    name: "zonehash",
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
] as const;
