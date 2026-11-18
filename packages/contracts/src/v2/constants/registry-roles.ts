/**
 * EnhancedAccessControl masks covering every role and every admin role.
 *
 * @stability stable
 * @since 1.0.0
 */
export const enhancedAccessControlRoles = {
  allRoles: 0x1111111111111111111111111111111111111111111111111111111111111111n,
  adminRoles: 0x1111111111111111111111111111111100000000000000000000000000000000n,
} as const;

/**
 * Registry roles from contracts-v2 v1.0.1 `RegistryRolesLib`. Each role is one nybble; its admin
 * role sits 128 bits higher.
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/registry/libraries/RegistryRolesLib.sol
 * @stability stable
 * @since 1.0.0
 */
export const registryRoles = {
  registrar: 1n << 0n,
  registrarAdmin: 1n << 128n,
  registerReserved: 1n << 4n,
  registerReservedAdmin: 1n << 132n,
  setParent: 1n << 8n,
  setParentAdmin: 1n << 136n,
  unregister: 1n << 12n,
  unregisterAdmin: 1n << 140n,
  renew: 1n << 16n,
  renewAdmin: 1n << 144n,
  setSubregistry: 1n << 20n,
  setSubregistryAdmin: 1n << 148n,
  setResolver: 1n << 24n,
  setResolverAdmin: 1n << 152n,
  canTransfer: 1n << 28n,
  canTransferAdmin: 1n << 156n,
  wasReserved: 1n << 32n,
  setUri: 1n << 36n,
  setUriAdmin: 1n << 164n,
  canName: 1n << 120n,
  canNameAdmin: 1n << 248n,
  upgrade: 1n << 124n,
  upgradeAdmin: 1n << 252n,
} as const;

/**
 * A single registry role bit from {@link registryRoles}.
 *
 * @stability stable
 * @since 1.0.0
 */
export type RegistryRole = (typeof registryRoles)[keyof typeof registryRoles];

const unemancipatedRegistryRoles =
  registryRoles.canTransferAdmin |
  registryRoles.setSubregistry |
  registryRoles.setSubregistryAdmin |
  registryRoles.setResolver |
  registryRoles.setResolverAdmin |
  registryRoles.unregister |
  registryRoles.unregisterAdmin;

/**
 * Registry role sets from contracts-v2 v1.0.1 `RegistryRolesLib`.
 *
 * - `unemancipated`: holding any of these on a name, other than as its sole owner, means the name
 *   is not emancipated. Excludes the renew and upgrade roles.
 * - `regeneration`: changing any of these regenerates the name's token ID.
 * - `registration`: the roles ETHRegistrar grants a new `.eth` owner; a sensible default for
 *   any new name an owner should control (resolver, subregistry, transfers).
 *
 * Mainnet WrapperRegistry follows these sets; the Sepolia WrapperRegistry build predates them.
 *
 * @stability stable
 * @since 1.0.0
 */
export const registryRoleBitmaps = {
  unemancipated: unemancipatedRegistryRoles,
  regeneration: unemancipatedRegistryRoles | registryRoles.canTransfer,
  registration:
    registryRoles.setSubregistry |
    registryRoles.setSubregistryAdmin |
    registryRoles.setResolver |
    registryRoles.setResolverAdmin |
    registryRoles.canTransferAdmin,
} as const;
