/**
 * ENSIP-7 content hash resolver profile.
 *
 * @since 1.0.0
 */
export const contenthashResolverAbi = [
  {
    type: "event",
    name: "ContenthashChanged",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "hash", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "contenthash",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link contenthashResolverAbi}.
 *
 * @since 1.0.0
 */
export const contenthashResolverInterfaceId = "0xbc1c58d1" as const;
