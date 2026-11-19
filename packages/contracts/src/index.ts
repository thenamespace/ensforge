/**
 * Contract ABIs as `as const` arrays, grouped by protocol (`v1`, `v2`, `shared`) and L2 namespace.
 *
 * @stability stable
 */
// Stable apart from `Abis.durin`, experimental like Durin upstream.
// oxlint-disable-next-line effecttsgo/api-stability-leak
export * as Abis from "./Abis.js";

/**
 * ENS deployment profiles: addresses, behaviour flags and provenance per chain.
 *
 * @stability stable
 */
// Stable apart from the HCA contracts (`V2Hca`, `V2.hca`), experimental like @ensforge/hca.
// oxlint-disable-next-line effecttsgo/api-stability-leak
export * as Deployments from "./Deployments.js";

/**
 * ERC-165 interface IDs of ENS contracts and resolver profiles.
 *
 * @stability stable
 */
export * as InterfaceIds from "./InterfaceIds.js";

/**
 * ENSv2 EnhancedAccessControl role bitmaps for registries and resolvers.
 *
 * @stability stable
 */
export * as Roles from "./Roles.js";
