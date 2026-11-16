/**
 * `IRentPriceOracle` interface ABI at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/registrar/interfaces/IRentPriceOracle.sol
 * @since 1.0.0
 */
export const rentPriceOracleV2InterfaceAbi = [
  {
    inputs: [
      {
        internalType: "string",
        name: "label",
        type: "string",
      },
    ],
    name: "NotValid",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "contract IERC20",
        name: "paymentToken",
        type: "address",
      },
    ],
    name: "PaymentTokenNotSupported",
    type: "error",
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
        name: "available",
        type: "uint64",
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
    name: "getRegisterPrice",
    outputs: [
      {
        internalType: "uint256",
        name: "base",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "premium",
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
      {
        internalType: "uint64",
        name: "expiry",
        type: "uint64",
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
        internalType: "contract IERC20",
        name: "paymentToken",
        type: "address",
      },
    ],
    name: "isPaymentToken",
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
] as const;
