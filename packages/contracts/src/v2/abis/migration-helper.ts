/**
 * Helper that batches ENSv1 to ENSv2 migrations.
 *
 * Superset of the mainnet and Sepolia deployments at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/migration/MigrationHelper.sol
 * @since 1.0.0
 */
export const migrationHelperV2Abi = [
  {
    inputs: [
      {
        internalType: "contract IRegistry",
        name: "rootRegistry",
        type: "address",
      },
      {
        internalType: "contract AbstractWrapperReceiver",
        name: "unlockedController",
        type: "address",
      },
      {
        internalType: "contract AbstractWrapperReceiver",
        name: "lockedController",
        type: "address",
      },
      {
        internalType: "contract IStandaloneHCAFactory",
        name: "standaloneHCAFactory",
        type: "address",
      },
      {
        internalType: "contract IContractNamer",
        name: "contractNamer",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "dns",
        type: "bytes",
      },
    ],
    name: "DNSDecodingFailed",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "nft",
        type: "address",
      },
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "NotApprovedOperator",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
    ],
    name: "ParentNotMigrated",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "contract IRegistry",
        name: "registry",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "errorData",
        type: "bytes",
      },
    ],
    name: "ResolutionError",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "WrappedOwnerMismatch",
    type: "error",
  },
  {
    inputs: [],
    name: "CONTRACT_NAMER",
    outputs: [
      {
        internalType: "contract IContractNamer",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "LOCKED_CONTROLLER",
    outputs: [
      {
        internalType: "contract AbstractWrapperReceiver",
        name: "",
        type: "address",
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
    name: "ROOT_REGISTRY",
    outputs: [
      {
        internalType: "contract IRegistry",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "UNLOCKED_CONTROLLER",
    outputs: [
      {
        internalType: "contract AbstractWrapperReceiver",
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
            internalType: "address",
            name: "owner",
            type: "address",
          },
          {
            internalType: "contract IRegistry",
            name: "subregistry",
            type: "address",
          },
          {
            internalType: "address",
            name: "resolver",
            type: "address",
          },
        ],
        internalType: "struct LibMigration.Data[]",
        name: "unwrapped",
        type: "tuple[]",
      },
      {
        components: [
          {
            internalType: "string",
            name: "label",
            type: "string",
          },
          {
            internalType: "address",
            name: "owner",
            type: "address",
          },
          {
            internalType: "contract IRegistry",
            name: "subregistry",
            type: "address",
          },
          {
            internalType: "address",
            name: "resolver",
            type: "address",
          },
        ],
        internalType: "struct LibMigration.Data[][]",
        name: "unlockedGroups",
        type: "tuple[][]",
      },
      {
        components: [
          {
            internalType: "string",
            name: "label",
            type: "string",
          },
          {
            internalType: "address",
            name: "owner",
            type: "address",
          },
          {
            internalType: "contract IRegistry",
            name: "subregistry",
            type: "address",
          },
          {
            internalType: "address",
            name: "resolver",
            type: "address",
          },
        ],
        internalType: "struct LibMigration.Data[][]",
        name: "lockedGroups",
        type: "tuple[][]",
      },
      {
        components: [
          {
            internalType: "bytes",
            name: "parentName",
            type: "bytes",
          },
          {
            components: [
              {
                internalType: "string",
                name: "label",
                type: "string",
              },
              {
                internalType: "address",
                name: "owner",
                type: "address",
              },
              {
                internalType: "contract IRegistry",
                name: "subregistry",
                type: "address",
              },
              {
                internalType: "address",
                name: "resolver",
                type: "address",
              },
            ],
            internalType: "struct LibMigration.Data[][]",
            name: "groups",
            type: "tuple[][]",
          },
        ],
        internalType: "struct LockedChildren[]",
        name: "lockedChildrenGroups",
        type: "tuple[]",
      },
    ],
    name: "migrate",
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
] as const;
