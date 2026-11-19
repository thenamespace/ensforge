/**
 * Complete L2Registry ABI: the L2 registry of a Durin name: an ERC-721 (token ID: the namehash) that is also its resolver.
 *
 * @see https://repo.sourcify.dev/8453/0xdeB09eB3111cB75d538216e8B8fC30047d75fb34
 * @stability experimental
 * @since 1.1.0
 */
export const durinL2RegistryAbi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "ERC721IncorrectOwner",
    type: "error",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "ERC721InsufficientApproval",
    type: "error",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    name: "ERC721InvalidApprover",
    type: "error",
    inputs: [
      {
        name: "approver",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "ERC721InvalidOperator",
    type: "error",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "ERC721InvalidOwner",
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
    name: "ERC721InvalidReceiver",
    type: "error",
    inputs: [
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "ERC721InvalidSender",
    type: "error",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    name: "ERC721NonexistentToken",
    type: "error",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    name: "InvalidInitialization",
    type: "error",
    inputs: [],
  },
  {
    name: "InvalidName",
    type: "error",
    inputs: [],
  },
  {
    name: "LabelTooLong",
    type: "error",
    inputs: [
      {
        name: "label",
        type: "string",
        internalType: "string",
      },
    ],
  },
  {
    name: "LabelTooShort",
    type: "error",
    inputs: [],
  },
  {
    name: "NotAvailable",
    type: "error",
    inputs: [
      {
        name: "label",
        type: "string",
        internalType: "string",
      },
      {
        name: "parentNode",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
  },
  {
    name: "NotInitializing",
    type: "error",
    inputs: [],
  },
  {
    name: "SignatureExpired",
    type: "error",
    inputs: [],
  },
  {
    name: "Unauthorized",
    type: "error",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
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
    name: "Approval",
    type: "event",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "approved",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
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
    name: "BaseURIUpdated",
    type: "event",
    inputs: [
      {
        name: "baseURI",
        type: "string",
        indexed: false,
        internalType: "string",
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
    name: "NewOwner",
    type: "event",
    inputs: [
      {
        name: "parentNode",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "labelhash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "owner",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "RegistrarAdded",
    type: "event",
    inputs: [
      {
        name: "registrar",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "RegistrarRemoved",
    type: "event",
    inputs: [
      {
        name: "registrar",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    name: "SubnodeCreated",
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
        name: "owner",
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
    name: "Transfer",
    type: "event",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
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
    name: "addRegistrar",
    type: "function",
    inputs: [
      {
        name: "registrar",
        type: "address",
        internalType: "address",
      },
    ],
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
        name: "",
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
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
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
    name: "baseNode",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
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
    name: "createSubnode",
    type: "function",
    inputs: [
      {
        name: "node",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "label",
        type: "string",
        internalType: "string",
      },
      {
        name: "_owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "data",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    name: "decodeName",
    type: "function",
    inputs: [
      {
        name: "_name",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "pure",
  },
  {
    name: "getApproved",
    type: "function",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
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
    name: "initialize",
    type: "function",
    inputs: [
      {
        name: "tokenName",
        type: "string",
        internalType: "string",
      },
      {
        name: "tokenSymbol",
        type: "string",
        internalType: "string",
      },
      {
        name: "baseURI",
        type: "string",
        internalType: "string",
      },
      {
        name: "admin",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "isApprovedForAll",
    type: "function",
    inputs: [
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
    name: "makeNode",
    type: "function",
    inputs: [
      {
        name: "parentNode",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "label",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "pure",
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
    inputs: [],
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
    name: "namehash",
    type: "function",
    inputs: [
      {
        name: "_name",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "pure",
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
        internalType: "address",
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
    name: "ownerOf",
    type: "function",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
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
    name: "registrars",
    type: "function",
    inputs: [
      {
        name: "registrar",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "approved",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "removeRegistrar",
    type: "function",
    inputs: [
      {
        name: "registrar",
        type: "address",
        internalType: "address",
      },
    ],
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
    name: "safeTransferFrom",
    type: "function",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "safeTransferFrom",
    type: "function",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenId",
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
    name: "setABIWithSignature",
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
      {
        name: "expiration",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "signer",
        type: "address",
        internalType: "address",
      },
      {
        name: "signature",
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
    name: "setAddrWithSignature",
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
      {
        name: "expiration",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "signer",
        type: "address",
        internalType: "address",
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
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
    name: "setBaseURI",
    type: "function",
    inputs: [
      {
        name: "baseURI",
        type: "string",
        internalType: "string",
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
    name: "setContenthashWithSignature",
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
      {
        name: "expiration",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "signer",
        type: "address",
        internalType: "address",
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
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
    name: "setTextWithSignature",
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
      {
        name: "expiration",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "signer",
        type: "address",
        internalType: "address",
      },
      {
        name: "signature",
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
    name: "symbol",
    type: "function",
    inputs: [],
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
    name: "tokenURI",
    type: "function",
    inputs: [
      {
        name: "tokenId",
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
    name: "totalSupply",
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
    name: "transferFrom",
    type: "function",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
