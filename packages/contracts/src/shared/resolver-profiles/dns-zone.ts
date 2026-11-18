/**
 * DNS zone hash resolver profile.
 *
 * @stability stable
 * @since 1.0.0
 */
export const dnsZoneResolverAbi = [
  {
    type: "event",
    name: "DNSZonehashChanged",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "lastzonehash", type: "bytes", indexed: false },
      { name: "zonehash", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "zonehash",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link dnsZoneResolverAbi}.
 *
 * @stability stable
 * @since 1.0.0
 */
export const dnsZoneResolverInterfaceId = "0x5c98042b" as const;
