/**
 * `IAddressSet` interface ABI at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/utils/interfaces/IAddressSet.sol
 * @since 1.0.0
 */
export const addressSetV2InterfaceAbi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "addr",
        type: "address",
      },
    ],
    name: "includes",
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
