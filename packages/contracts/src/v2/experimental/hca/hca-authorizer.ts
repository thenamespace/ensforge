/**
 * Complete HCAAuthorizer ABI from ENSv2's experimental HCA layer.
 *
 * @stability experimental
 * @since 1.0.0
 */
export const hcaAuthorizerV2Abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "hca",
        type: "address",
      },
    ],
    name: "HCADeploymentNotTrusted",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        internalType: "address",
        name: "hcaOwner",
        type: "address",
      },
    ],
    name: "HCAOwnerMismatch",
    type: "error",
  },
  {
    inputs: [],
    name: "STANDALONE_HCA_FACTORY",
    outputs: [
      {
        internalType: "contract IStandaloneHCAFactory",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
