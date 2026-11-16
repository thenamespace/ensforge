/**
 * Resolver-native batching used for resolving multiple records for one name.
 *
 * @since 1.0.0
 */
export const multicallResolverAbi = [
  {
    type: "function",
    name: "multicall",
    stateMutability: "view",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;
