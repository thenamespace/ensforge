/**
 * ERC-165 interface IDs of the ENSv2 registry interfaces, verified against contracts-v2 v1.0.1.
 *
 * @since 1.0.0
 */
export const registryInterfaceIds = {
  registry: "0x51f67f40",
  ownedRegistry: "0x63560a8e",
  permissionedRegistry: "0xc18bd555",
  standardRegistry: "0xb844ab6c",
  temporalRegistry: "0x6f537c72",
  tokenizedRegistry: "0x91b3c037",
  wrapperRegistry: "0xf5586a0b",
} as const;

/**
 * An interface ID from {@link registryInterfaceIds}.
 *
 * @since 1.0.0
 */
export type RegistryInterfaceId = (typeof registryInterfaceIds)[keyof typeof registryInterfaceIds];

/**
 * ERC-165 interface IDs of `IWrapperRegistryInitializable`, keyed like the
 * `wrapperRegistryInitializer` capability: `explicit` for `initialize(bytes32,address,string,uint256)`
 * (Sepolia) and `fuseDerived` for `initialize(bytes32,address)` (mainnet).
 *
 * @since 1.0.0
 */
export const wrapperRegistryInitializableInterfaceIds = {
  explicit: "0x1542c01a",
  fuseDerived: "0x6910e334",
} as const;
