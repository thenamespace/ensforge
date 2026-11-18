/**
 * `IETHRenewer` interface ABI at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/registrar/interfaces/IETHRenewer.sol
 * @stability stable
 * @since 1.0.0
 */
export const ethRenewerV2InterfaceAbi = [
  {
    inputs: [
      {
        internalType: "uint64",
        name: "duration",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "minDuration",
        type: "uint64",
      },
    ],
    name: "DurationTooShort",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "label",
        type: "string",
      },
    ],
    name: "NameNotRenewable",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "label",
        type: "string",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "duration",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "newExpiry",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "contract IERC20",
        name: "paymentToken",
        type: "address",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "referrer",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "NameRenewed",
    type: "event",
  },
  {
    inputs: [],
    name: "GRACE_PERIOD",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "label",
        type: "string",
      },
    ],
    name: "getRemainingGracePeriod",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "label",
        type: "string",
      },
      {
        internalType: "uint64",
        name: "duration",
        type: "uint64",
      },
      {
        internalType: "contract IERC20",
        name: "paymentToken",
        type: "address",
      },
    ],
    name: "getRenewPrice",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "label",
        type: "string",
      },
    ],
    name: "isRenewable",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "string",
            name: "label",
            type: "string",
          },
          {
            internalType: "uint64",
            name: "duration",
            type: "uint64",
          },
          {
            internalType: "bytes32",
            name: "referrer",
            type: "bytes32",
          },
        ],
        internalType: "struct RenewData",
        name: "rd",
        type: "tuple",
      },
      {
        internalType: "contract IERC20",
        name: "paymentToken",
        type: "address",
      },
    ],
    name: "renew",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "string",
            name: "label",
            type: "string",
          },
          {
            internalType: "uint64",
            name: "duration",
            type: "uint64",
          },
          {
            internalType: "bytes32",
            name: "referrer",
            type: "bytes32",
          },
        ],
        internalType: "struct RenewData[]",
        name: "rds",
        type: "tuple[]",
      },
      {
        internalType: "contract IERC20",
        name: "paymentToken",
        type: "address",
      },
    ],
    name: "renewBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
