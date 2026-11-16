/**
 * `IContractNamer` interface ABI at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/reverse-registrar/interfaces/IContractNamer.sol
 * @since 1.0.0
 */
export const contractNamerV2InterfaceAbi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "namer",
        type: "address",
      },
    ],
    name: "isContractNamer",
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
