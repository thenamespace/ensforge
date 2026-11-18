/**
 * ERC-165 interface IDs for ENS contracts and resolver profiles.
 *
 * **Example** (Detecting a PermissionedResolver)
 *
 * ```ts
 * import { Abis, InterfaceIds } from "@ensforge/contracts"
 *
 * const permissioned = await client.readContract({
 *   address: resolver,
 *   abi: Abis.shared.erc165,
 *   functionName: "supportsInterface",
 *   args: [InterfaceIds.resolver.permissionedResolver],
 * })
 * ```
 *
 * @since 1.0.0
 */
export {
  registryInterfaceIds as registry,
  resolverInterfaceIds as resolver,
  wrapperRegistryInitializableInterfaceIds as wrapperRegistryInitializable,
  type RegistryInterfaceId,
  type ResolverInterfaceId,
} from "./v2/constants/index.js";
export { erc165InterfaceId as erc165 } from "./shared/erc165.js";

/**
 * ERC-165 interface IDs of the resolver profiles, keyed by profile.
 *
 * **Example** (Checking for text record support)
 *
 * ```ts
 * import { Abis, InterfaceIds } from "@ensforge/contracts"
 *
 * const supportsText = await client.readContract({
 *   address: resolver,
 *   abi: Abis.shared.erc165,
 *   functionName: "supportsInterface",
 *   args: [InterfaceIds.resolverProfiles.text],
 * })
 * ```
 *
 * @stability stable
 */
export * as resolverProfiles from "./interface-ids/resolver-profiles.js";
