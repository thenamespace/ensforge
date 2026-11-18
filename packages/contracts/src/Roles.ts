/**
 * ENSv2 EnhancedAccessControl role bitmaps for registries and PermissionedResolvers.
 *
 * **Example** (Checking a registry role)
 *
 * ```ts
 * import { Roles } from "@ensforge/contracts"
 *
 * const canRenew = (bitmap & Roles.registry.renew) !== 0n
 * ```
 *
 * **Example** (Granting a role and its admin)
 *
 * ```ts
 * import { Roles } from "@ensforge/contracts"
 *
 * const roles = Roles.registry.setResolver | Roles.registry.setResolverAdmin
 * const isAdminOnly = (roles & Roles.enhancedAccessControl.adminRoles) === roles
 * ```
 *
 * @since 1.0.0
 */
export {
  enhancedAccessControlRoles as enhancedAccessControl,
  registryRoleBitmaps as registryBitmaps,
  registryRoles as registry,
  resolverRoles as resolver,
  type RegistryRole,
  type ResolverRole,
} from "./v2/constants/index.js";
