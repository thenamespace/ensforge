/**
 * Legacy ETH-only address resolver profile.
 *
 * @since 1.0.0
 */
export const addrResolverAbi = [
  {
    type: "event",
    name: "AddrChanged",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "a", type: "address", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link addrResolverAbi}.
 *
 * @since 1.0.0
 */
export const addrResolverInterfaceId = "0x3b3b57de" as const;

/**
 * ENSIP-9 multicoin address resolver profile.
 *
 * @since 1.0.0
 */
export const addressResolverAbi = [
  {
    type: "event",
    name: "AddressChanged",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "coinType", type: "uint256", indexed: false },
      { name: "newAddress", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "coinType", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link addressResolverAbi}.
 *
 * @since 1.0.0
 */
export const addressResolverInterfaceId = "0xf1cb7e06" as const;

/**
 * Optional address-presence capability used by current ENS resolvers.
 *
 * @since 1.0.0
 */
export const hasAddressResolverAbi = [
  {
    type: "function",
    name: "hasAddr",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "coinType", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link hasAddressResolverAbi}.
 *
 * @since 1.0.0
 */
export const hasAddressResolverInterfaceId = "0x32f111d7" as const;
