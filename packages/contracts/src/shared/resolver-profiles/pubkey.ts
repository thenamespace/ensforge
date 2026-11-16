/**
 * SECP256k1 public key resolver profile.
 *
 * @since 1.0.0
 */
export const pubkeyResolverAbi = [
  {
    type: "event",
    name: "PubkeyChanged",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "x", type: "bytes32", indexed: false },
      { name: "y", type: "bytes32", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "pubkey",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [
      { name: "x", type: "bytes32" },
      { name: "y", type: "bytes32" },
    ],
  },
] as const;

/**
 * ERC-165 interface ID of {@link pubkeyResolverAbi}.
 *
 * @since 1.0.0
 */
export const pubkeyResolverInterfaceId = "0xc8690233" as const;
