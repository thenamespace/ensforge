/**
 * ENSIP-5 text record resolver profile.
 *
 * @since 1.0.0
 */
export const textResolverAbi = [
  {
    type: "event",
    name: "TextChanged",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "indexedKey", type: "string", indexed: true },
      { name: "key", type: "string", indexed: false },
      { name: "value", type: "string", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link textResolverAbi}.
 *
 * @since 1.0.0
 */
export const textResolverInterfaceId = "0x59d1d43c" as const;
