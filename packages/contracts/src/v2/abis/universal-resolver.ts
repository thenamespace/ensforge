/**
 * Universal Resolver implementation that resolves through ENSv2 with ENSv1 fallback.
 *
 * Superset of the mainnet and Sepolia deployments at contracts-v2 v1.0.1.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/universalResolver/UniversalResolverV2.sol
 */
export const universalResolverV2Abi = [
  {
    inputs: [
      {
        internalType: "contract IPermissionedRegistry",
        name: "rootRegistry",
        type: "address",
      },
      {
        internalType: "contract IGatewayProvider",
        name: "batchGatewayProvider",
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
        internalType: "string",
        name: "ens",
        type: "string",
      },
    ],
    name: "DNSEncodingFailed",
    type: "error",
  },
  {
    inputs: [],
    name: "EmptyAddress",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint16",
        name: "status",
        type: "uint16",
      },
      {
        internalType: "string",
        name: "message",
        type: "string",
      },
    ],
    name: "HttpError",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidBatchGatewayResponse",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidOffchainLookup",
    type: "error",
  },
  {
    inputs: [],
    name: "LabelIsEmpty",
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
    name: "LabelIsTooLong",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "normalizedName",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "result",
        type: "bytes",
      },
      {
        internalType: "address",
        name: "resolver",
        type: "address",
      },
    ],
    name: "NormalizationChangedName",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        internalType: "string[]",
        name: "urls",
        type: "string[]",
      },
      {
        internalType: "bytes",
        name: "callData",
        type: "bytes",
      },
      {
        internalType: "bytes4",
        name: "callbackFunction",
        type: "bytes4",
      },
      {
        internalType: "bytes",
        name: "extraData",
        type: "bytes",
      },
    ],
    name: "OffchainLookup",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "offset",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "length",
        type: "uint256",
      },
    ],
    name: "OffsetOutOfBoundsError",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "primary",
        type: "string",
      },
    ],
    name: "PrimaryNameNotNormalized",
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
        internalType: "bytes",
        name: "errorData",
        type: "bytes",
      },
    ],
    name: "ResolverError",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
      {
        internalType: "address",
        name: "resolver",
        type: "address",
      },
    ],
    name: "ResolverNotContract",
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
    name: "ResolverNotFound",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "primary",
        type: "string",
      },
      {
        internalType: "bytes",
        name: "primaryAddress",
        type: "bytes",
      },
    ],
    name: "ReverseAddressMismatch",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    name: "UnsafeBatchGatewayResponse",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "selector",
        type: "bytes4",
      },
    ],
    name: "UnsupportedResolverProfile",
    type: "error",
  },
  {
    inputs: [],
    name: "BATCH_GATEWAY_PROVIDER",
    outputs: [
      {
        internalType: "contract IGatewayProvider",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
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
    name: "ROOT_REGISTRY",
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
    name: "batchGatewayProvider",
    outputs: [
      {
        internalType: "contract IGatewayProvider",
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
            components: [
              {
                internalType: "address",
                name: "target",
                type: "address",
              },
              {
                internalType: "bytes",
                name: "call",
                type: "bytes",
              },
              {
                internalType: "bytes",
                name: "data",
                type: "bytes",
              },
              {
                internalType: "uint256",
                name: "flags",
                type: "uint256",
              },
            ],
            internalType: "struct CCIPBatcher.Lookup[]",
            name: "lookups",
            type: "tuple[]",
          },
          {
            internalType: "string[]",
            name: "gateways",
            type: "string[]",
          },
        ],
        internalType: "struct CCIPBatcher.Batch",
        name: "batch",
        type: "tuple",
      },
    ],
    name: "ccipBatch",
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "target",
                type: "address",
              },
              {
                internalType: "bytes",
                name: "call",
                type: "bytes",
              },
              {
                internalType: "bytes",
                name: "data",
                type: "bytes",
              },
              {
                internalType: "uint256",
                name: "flags",
                type: "uint256",
              },
            ],
            internalType: "struct CCIPBatcher.Lookup[]",
            name: "lookups",
            type: "tuple[]",
          },
          {
            internalType: "string[]",
            name: "gateways",
            type: "string[]",
          },
        ],
        internalType: "struct CCIPBatcher.Batch",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "response",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "extraData",
        type: "bytes",
      },
    ],
    name: "ccipBatchCallback",
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "target",
                type: "address",
              },
              {
                internalType: "bytes",
                name: "call",
                type: "bytes",
              },
              {
                internalType: "bytes",
                name: "data",
                type: "bytes",
              },
              {
                internalType: "uint256",
                name: "flags",
                type: "uint256",
              },
            ],
            internalType: "struct CCIPBatcher.Lookup[]",
            name: "lookups",
            type: "tuple[]",
          },
          {
            internalType: "string[]",
            name: "gateways",
            type: "string[]",
          },
        ],
        internalType: "struct CCIPBatcher.Batch",
        name: "batch",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "response",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "extraData",
        type: "bytes",
      },
    ],
    name: "ccipReadCallback",
    outputs: [],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
    ],
    name: "findResolver",
    outputs: [
      {
        internalType: "address",
        name: "resolver",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "node",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "offset",
        type: "uint256",
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
    inputs: [],
    name: "isENSv2",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
      {
        internalType: "contract IENSIP15",
        name: "ensip15",
        type: "address",
      },
    ],
    name: "normalize",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
    ],
    name: "requireResolver",
    outputs: [
      {
        components: [
          {
            internalType: "bytes",
            name: "name",
            type: "bytes",
          },
          {
            internalType: "uint256",
            name: "offset",
            type: "uint256",
          },
          {
            internalType: "bytes32",
            name: "node",
            type: "bytes32",
          },
          {
            internalType: "address",
            name: "resolver",
            type: "address",
          },
          {
            internalType: "bool",
            name: "extended",
            type: "bool",
          },
        ],
        internalType: "struct IUniversalResolverExtended.ResolverInfo",
        name: "info",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "resolve",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
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
        internalType: "bytes",
        name: "response",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "extraData",
        type: "bytes",
      },
    ],
    name: "resolveBatchCallback",
    outputs: [],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "response",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "extraData",
        type: "bytes",
      },
    ],
    name: "resolveCallback",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "response",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "extraData",
        type: "bytes",
      },
    ],
    name: "resolveDirectCallback",
    outputs: [],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "response",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    name: "resolveDirectCallbackError",
    outputs: [],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
      {
        internalType: "string[]",
        name: "gateways",
        type: "string[]",
      },
    ],
    name: "resolveWithGateways",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
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
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
      {
        internalType: "string[]",
        name: "gateways",
        type: "string[]",
      },
      {
        internalType: "contract IENSIP15",
        name: "ensip15",
        type: "address",
      },
    ],
    name: "resolveWithGatewaysAndNormalization",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
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
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
      {
        internalType: "contract IENSIP15",
        name: "ensip15",
        type: "address",
      },
    ],
    name: "resolveWithNormalization",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
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
        internalType: "address",
        name: "resolver",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
      {
        internalType: "string[]",
        name: "gateways",
        type: "string[]",
      },
    ],
    name: "resolveWithResolver",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "lookupAddress",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "coinType",
        type: "uint256",
      },
    ],
    name: "reverse",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
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
        internalType: "bytes",
        name: "response",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "extraData",
        type: "bytes",
      },
    ],
    name: "reverseAddressCallback",
    outputs: [
      {
        internalType: "string",
        name: "primary",
        type: "string",
      },
      {
        internalType: "address",
        name: "resolver",
        type: "address",
      },
      {
        internalType: "address",
        name: "reverseResolver",
        type: "address",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "response",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "extraData",
        type: "bytes",
      },
    ],
    name: "reverseNameCallback",
    outputs: [
      {
        internalType: "string",
        name: "primary",
        type: "string",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
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
        internalType: "bytes",
        name: "lookupAddress",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "coinType",
        type: "uint256",
      },
      {
        internalType: "string[]",
        name: "gateways",
        type: "string[]",
      },
    ],
    name: "reverseWithGateways",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
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
        internalType: "bytes",
        name: "lookupAddress",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "coinType",
        type: "uint256",
      },
      {
        internalType: "string[]",
        name: "gateways",
        type: "string[]",
      },
      {
        internalType: "contract IENSIP15",
        name: "ensip15",
        type: "address",
      },
    ],
    name: "reverseWithGatewaysAndNormalization",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
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
        internalType: "bytes",
        name: "lookupAddress",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "coinType",
        type: "uint256",
      },
      {
        internalType: "contract IENSIP15",
        name: "ensip15",
        type: "address",
      },
    ],
    name: "reverseWithNormalization",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
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
