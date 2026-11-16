/**
 * IUniversalResolverExtended ABI from the pinned ENSv2 snapshot.
 *
 * @since 1.0.0
 */
export const universalResolverV2InterfaceAbi = [
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
        internalType: "bytes4",
        name: "selector",
        type: "bytes4",
      },
    ],
    name: "UnsupportedResolverProfile",
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
        name: "resolverOffset",
        type: "uint256",
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
        name: "result",
        type: "bytes",
      },
      {
        internalType: "address",
        name: "resolver",
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
    ],
    name: "resolveWithGateways",
    outputs: [
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
    stateMutability: "view",
    type: "function",
  },
] as const;
