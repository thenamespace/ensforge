/**
 * `ILabelStore` interface ABI at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/utils/interfaces/ILabelStore.sol
 * @since 1.0.0
 */
export const labelStoreV2InterfaceAbi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "labelHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "string",
        name: "label",
        type: "string",
      },
    ],
    name: "Label",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "anyId",
        type: "uint256",
      },
    ],
    name: "getLabel",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
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
    name: "setLabel",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
