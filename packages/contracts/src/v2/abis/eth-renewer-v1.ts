/**
 * Renewal controller that extends unmigrated ENSv1 `.eth` names.
 *
 * Superset of the mainnet and Sepolia deployments at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/registrar/ETHRenewerV1.sol
 * @stability stable
 * @since 1.0.0
 */
export const ethRenewerV1Abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "owner_",
        type: "address",
      },
      {
        internalType: "contract IPermissionedRegistry",
        name: "ethRegistry",
        type: "address",
      },
      {
        internalType: "address",
        name: "beneficiary",
        type: "address",
      },
      {
        internalType: "contract IRentPriceOracle",
        name: "oracle",
        type: "address",
      },
      {
        internalType: "uint64",
        name: "gracePeriod",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "bonusPeriod",
        type: "uint64",
      },
      {
        internalType: "contract INameWrapper",
        name: "nameWrapper",
        type: "address",
      },
      {
        internalType: "address",
        name: "wrappedController",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
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
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "OwnableInvalidOwner",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "OwnableUnauthorizedAccount",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
    ],
    name: "SafeERC20FailedOperation",
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
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "contract IRentPriceOracle",
        name: "oracle",
        type: "address",
      },
    ],
    name: "RentPriceOracleUpdated",
    type: "event",
  },
  {
    inputs: [],
    name: "BASE_REGISTRAR",
    outputs: [
      {
        internalType: "contract BaseRegistrarImplementation",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "BENEFICIARY",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "ETH_REGISTRY",
    outputs: [
      {
        internalType: "contract IPermissionedRegistry",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
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
    inputs: [],
    name: "MIN_RENEW_DURATION",
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
    inputs: [],
    name: "NAME_WRAPPER",
    outputs: [
      {
        internalType: "contract INameWrapper",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "WRAPPED_CONTROLLER",
    outputs: [
      {
        internalType: "contract IWrappedETHRegistrarController",
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
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
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
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "rentPriceOracle",
    outputs: [
      {
        internalType: "contract IRentPriceOracle",
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
        internalType: "address",
        name: "resolver",
        type: "address",
      },
    ],
    name: "setRegistrarResolver",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "contract IRentPriceOracle",
        name: "oracle",
        type: "address",
      },
    ],
    name: "setRentPriceOracle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
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
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string[]",
        name: "labels",
        type: "string[]",
      },
    ],
    name: "syncWrapper",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferRegistrarOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
