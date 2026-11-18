/**
 * ERC-165 interface IDs of the ENSv2 resolver interfaces, verified against contracts-v2 v1.0.1.
 *
 * @stability stable
 * @since 1.0.0
 */
export const resolverInterfaceIds = {
  permissionedResolver: "0x8c2427cc",
  permissionedResolverInitializable: "0x33cc44a0",
} as const;

/**
 * An interface ID from {@link resolverInterfaceIds}.
 *
 * @stability stable
 * @since 1.0.0
 */
export type ResolverInterfaceId = (typeof resolverInterfaceIds)[keyof typeof resolverInterfaceIds];
