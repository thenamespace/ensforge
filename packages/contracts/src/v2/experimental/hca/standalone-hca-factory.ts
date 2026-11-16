/**
 * Factory that deploys standalone hosted contract accounts (HCAs).
 *
 * Superset of the mainnet and Sepolia deployments at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/hca/StandaloneHCAFactory.sol
 * @since 1.0.0
 */
export const standaloneHcaFactoryV2Abi = [
  {
    inputs: [
      {
        internalType: "contract IVerifiableFactory",
        name: "verifiableFactory",
        type: "address",
      },
      {
        internalType: "address",
        name: "owner_",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "HCAImplementationCannotBeZero",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "hcaImplementation",
        type: "address",
      },
    ],
    name: "HCAImplementationNotApproved",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "hca",
        type: "address",
      },
    ],
    name: "HCAOwnerUnavailable",
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
    inputs: [],
    name: "OwnerCannotBeZero",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "expectedImplementation",
        type: "address",
      },
      {
        internalType: "address",
        name: "actualImplementation",
        type: "address",
      },
    ],
    name: "UnexpectedHCAImplementation",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "expectedOwner",
        type: "address",
      },
      {
        internalType: "address",
        name: "actualOwner",
        type: "address",
      },
    ],
    name: "UnexpectedHCAOwner",
    type: "error",
  },
  {
    inputs: [],
    name: "VerifiableFactoryCannotBeZero",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "hca",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "userSalt",
        type: "uint256",
      },
    ],
    name: "HCADeployed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address",
      },
      {
        indexed: true,
        internalType: "bool",
        name: "approved",
        type: "bool",
      },
    ],
    name: "ImplementationApprovalChanged",
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
    inputs: [],
    name: "VERIFIABLE_FACTORY",
    outputs: [
      {
        internalType: "contract IVerifiableFactory",
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
        name: "implementation",
        type: "address",
      },
    ],
    name: "approvedImplementations",
    outputs: [
      {
        internalType: "bool",
        name: "approved",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "hca",
        type: "address",
      },
    ],
    name: "authorizedOwnerOf",
    outputs: [
      {
        internalType: "address",
        name: "owner",
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
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "hcaImplementation",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "userSalt",
        type: "uint256",
      },
    ],
    name: "deploy",
    outputs: [
      {
        internalType: "address",
        name: "hca",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "hcaImplementation",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "userSalt",
        type: "uint256",
      },
    ],
    name: "deploymentSalt",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "hca",
        type: "address",
      },
    ],
    name: "hcaOwners",
    outputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
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
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address",
      },
      {
        internalType: "bool",
        name: "approved",
        type: "bool",
      },
    ],
    name: "setImplementationApproval",
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
] as const;
