/**
 * Resolver profile that clears all records by bumping a version.
 *
 * @since 1.0.0
 */
export const versionableResolverAbi = [
  {
    type: "event",
    name: "VersionChanged",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "newVersion", type: "uint64", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "recordVersions",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "uint64" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link versionableResolverAbi}.
 *
 * @since 1.0.0
 */
export const versionableResolverInterfaceId = "0xd700ff33" as const;
