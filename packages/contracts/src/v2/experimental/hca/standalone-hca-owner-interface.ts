/**
 * Complete IStandaloneHCAOwner ABI from ENSv2's experimental HCA layer.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const standaloneHcaOwnerV2InterfaceAbi = [
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
    inputs: [],
    name: "ownerAndSessionNonce",
    outputs: [
      {
        internalType: "address",
        name: "owner_",
        type: "address",
      },
      {
        internalType: "uint96",
        name: "sessionNonce_",
        type: "uint96",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
