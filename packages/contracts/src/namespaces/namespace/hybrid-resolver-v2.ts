/**
 * Complete HybridResolverV2 ABI: the ENSv2-aware Ethereum resolver of Namespace parent names, with a route table (`findRoute`).
 *
 * @see https://repo.sourcify.dev/1/0x0A67542cbD8d71CB760d1EeB5a4b4a77ea35Ff9b
 * @stability stable
 * @since 1.1.0
 */
export const namespaceHybridResolverV2Abi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "nameWrapper",
        type: "address",
        internalType: "contract INameWrapper",
      },
      {
        name: "initialRootRegistry",
        type: "address",
        internalType: "contract IRegistry",
      },
      {
        name: "initialOwner",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    name: "DNSDecodingFailed",
    type: "error",
    inputs: [
      {
        name: "dns",
        type: "bytes",
        internalType: "bytes",
      },
    ],
  },
  {
    name: "InvalidContentType",
    type: "error",
    inputs: [
      {
        name: "contentType",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    name: "InvalidEVMAddress",
    type: "error",
    inputs: [
      {
        name: "addressBytes",
        type: "bytes",
        internalType: "bytes",
      },
    ],
  },
  {
    name: "InvalidGatewayResponse",
    type: "error",
    inputs: [],
  },
  {
    name: "InvalidName",
    type: "error",
    inputs: [],
  },
  {
    name: "InvalidRecordNode",
    type: "error",
    inputs: [
      {
        name: "index",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    name: "InvalidRoute",
    type: "error",
    inputs: [],
  },
  {
    name: "MissingRegistryV1",
    type: "error",
    inputs: [],
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
    name: "RouteAlreadySet",
    type: "error",
    inputs: [
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    name: "RouteNotFound",
    type: "error",
    inputs: [
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    name: "Unauthorized",
    type: "error",
    inputs: [
      {
        name: "name",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "caller",
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
    name: "ABIUpdated",
    type: "event",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
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
    name: "AddressUpdated",
    type: "event",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "coinType",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "addressBytes",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    name: "Approved",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
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
    name: "ContenthashUpdated",
    type: "event",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
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
    name: "DataChanged",
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
        name: "indexedData",
        type: "bytes",
        indexed: true,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    name: "DataUpdated",
    type: "event",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "keyHash",
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
        type: "bytes",
        indexed: false,
        internalType: "bytes",
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
    name: "InterfaceUpdated",
    type: "event",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "interfaceId",
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
    name: "NameRouteSet",
    type: "event",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "id",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    name: "NameUpdated",
    type: "event",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "primaryName",
        type: "string",
        indexed: false,
        internalType: "string",
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
    name: "RootRegistryChanged",
    type: "event",
    inputs: [
      {
        name: "rootRegistry",
        type: "address",
        indexed: false,
        internalType: "contract IRegistry",
      },
    ],
    anonymous: false,
  },
  {
    name: "RouteSet",
    type: "event",
    inputs: [
      {
        name: "id",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "url",
        type: "string",
        indexed: false,
        internalType: "string",
      },
      {
        name: "signer",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "RouteUpdated",
    type: "event",
    inputs: [
      {
        name: "id",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "url",
        type: "string",
        indexed: false,
        internalType: "string",
      },
      {
        name: "signer",
        type: "address",
        indexed: false,
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
    name: "TextUpdated",
    type: "event",
    inputs: [
      {
        name: "recordId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "keyHash",
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
    name: "NAME_WRAPPER",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract INameWrapper",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "OFFCHAIN_ROUTE",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "REGISTRY_V1",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract ENS",
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
        name: "name",
        type: "bytes",
        internalType: "bytes",
      },
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
    name: "canModifyName",
    type: "function",
    inputs: [
      {
        name: "name",
        type: "bytes",
        internalType: "bytes",
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
    name: "data",
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
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "findRoute",
    type: "function",
    inputs: [
      {
        name: "fullName",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "hasAddr",
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
        type: "bool",
        internalType: "bool",
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
        name: "interfaceId",
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
    name: "isApproved",
    type: "function",
    inputs: [
      {
        name: "name",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "owner",
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
        name: "calls",
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
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "calls",
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
    name: "nameRoutes",
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
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "names",
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
        name: "name",
        type: "bytes",
        internalType: "bytes",
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
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "version",
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
        name: "fullName",
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
        name: "result",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "rootRegistry",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IRegistry",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "routes",
    type: "function",
    inputs: [
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "url",
        type: "string",
        internalType: "string",
      },
      {
        name: "signer",
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
    name: "setABI",
    type: "function",
    inputs: [
      {
        name: "name",
        type: "bytes",
        internalType: "bytes",
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
        name: "addressBytes",
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
        name: "addr",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setAddress",
    type: "function",
    inputs: [
      {
        name: "name",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "coinType",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "addressBytes",
        type: "bytes",
        internalType: "bytes",
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
    name: "setContenthash",
    type: "function",
    inputs: [
      {
        name: "name",
        type: "bytes",
        internalType: "bytes",
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
    name: "setData",
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
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setData",
    type: "function",
    inputs: [
      {
        name: "name",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "key",
        type: "string",
        internalType: "string",
      },
      {
        name: "value",
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
        name: "name",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "interfaceId",
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
    name: "setInterface",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "interfaceId",
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
        name: "name",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "primaryName",
        type: "string",
        internalType: "string",
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
        name: "primaryName",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setNameRoute",
    type: "function",
    inputs: [
      {
        name: "name",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setNameRoute",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setRootRegistry",
    type: "function",
    inputs: [
      {
        name: "newRootRegistry",
        type: "address",
        internalType: "contract IRegistry",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setRoute",
    type: "function",
    inputs: [
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "url",
        type: "string",
        internalType: "string",
      },
      {
        name: "signer",
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
    name: "setText",
    type: "function",
    inputs: [
      {
        name: "name",
        type: "bytes",
        internalType: "bytes",
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
    stateMutability: "pure",
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
    name: "updateRoute",
    type: "function",
    inputs: [
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "url",
        type: "string",
        internalType: "string",
      },
      {
        name: "signer",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
