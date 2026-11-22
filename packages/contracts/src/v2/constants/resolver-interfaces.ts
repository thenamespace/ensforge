/**
 * ERC-165 interface IDs of the ENSv2 resolver interfaces, verified against contracts-v2 v1.0.1.
 *
 * @stability stable
 * @since 1.0.0
 */
export const resolverInterfaceIds = {
  permissionedResolver: "0x8c2427cc",
  permissionedResolverInitializable: "0x33cc44a0",
  /**
   * `IAddressSetter` (`setAddress(bytes,uint256,bytes)`): setters that take the DNS-encoded name,
   * declared by every resolver built on contracts-v2's `AbstractRecordResolver`.
   */
  addressSetter: "0xb4436dde",
} as const;

/**
 * An interface ID from {@link resolverInterfaceIds}.
 *
 * @stability stable
 * @since 1.0.0
 */
export type ResolverInterfaceId = (typeof resolverInterfaceIds)[keyof typeof resolverInterfaceIds];
