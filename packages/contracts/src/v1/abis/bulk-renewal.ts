/**
 * Complete IBulkRenewal ABI from @ensdomains/ens-contracts v1.7.0.
 *
 * @stability stable
 * @since 1.0.0
 */
export const bulkRenewalV1InterfaceAbi = [
  {
    inputs: [
      {
        internalType: "string[]",
        name: "names",
        type: "string[]",
      },
      {
        internalType: "uint256",
        name: "duration",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "referrer",
        type: "bytes32",
      },
    ],
    name: "renewAll",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string[]",
        name: "names",
        type: "string[]",
      },
      {
        internalType: "uint256",
        name: "duration",
        type: "uint256",
      },
    ],
    name: "rentPrice",
    outputs: [
      {
        internalType: "uint256",
        name: "total",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Complete BulkRenewal ABI from @ensdomains/ens-contracts v1.7.0.
 *
 * @stability stable
 * @since 1.0.0
 */
export const bulkRenewalV1Abi = [
  {
    inputs: [
      {
        internalType: "contract ENS",
        name: "_ens",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "ens",
    outputs: [
      {
        internalType: "contract ENS",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string[]",
        name: "names",
        type: "string[]",
      },
      {
        internalType: "uint256",
        name: "duration",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "referrer",
        type: "bytes32",
      },
    ],
    name: "renewAll",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string[]",
        name: "names",
        type: "string[]",
      },
      {
        internalType: "uint256",
        name: "duration",
        type: "uint256",
      },
    ],
    name: "rentPrice",
    outputs: [
      {
        internalType: "uint256",
        name: "total",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceID",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
] as const;

/**
 * Complete StaticBulkRenewal ABI from @ensdomains/ens-contracts v1.7.0.
 *
 * @stability stable
 * @since 1.0.0
 */
export const staticBulkRenewalV1Abi = [
  {
    inputs: [
      {
        internalType: "contract ETHRegistrarController",
        name: "_controller",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "string[]",
        name: "names",
        type: "string[]",
      },
      {
        internalType: "uint256",
        name: "duration",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "referrer",
        type: "bytes32",
      },
    ],
    name: "renewAll",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string[]",
        name: "names",
        type: "string[]",
      },
      {
        internalType: "uint256",
        name: "duration",
        type: "uint256",
      },
    ],
    name: "rentPrice",
    outputs: [
      {
        internalType: "uint256",
        name: "total",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceID",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
] as const;
