/**
 * ENSIP-10 wildcard resolution profile.
 *
 * @stability stable
 * @since 1.0.0
 */
export const extendedResolverAbi = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link extendedResolverAbi}.
 *
 * @stability stable
 * @since 1.0.0
 */
export const extendedResolverInterfaceId = "0x9061b923" as const;

/**
 * Extended DNS resolution profile with caller-provided context.
 *
 * @stability stable
 * @since 1.0.0
 */
export const extendedDnsResolverAbi = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "data", type: "bytes" },
      { name: "context", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link extendedDnsResolverAbi}.
 *
 * @stability stable
 * @since 1.0.0
 */
export const extendedDnsResolverInterfaceId = "0x8ef98a7e" as const;
