import type { EnsDeploymentProfile } from "../../config/config.js";
import type { EthereumAddress } from "../../schemas/identity.js";

export type ResolverAuthorizationModel = "owner-delegate" | "role" | "unknown";

export const getResolverAuthorizationModel = (
  resolver: EthereumAddress,
  permissioned: boolean,
  profile: EnsDeploymentProfile,
): ResolverAuthorizationModel => {
  if (permissioned) return "role";

  const publicResolvers = [
    profile.v1?.contracts.publicResolver,
    profile.v2?.contracts.publicResolver,
  ];

  const known = publicResolvers.some(
    (address) => address?.toLowerCase() === resolver.toLowerCase(),
  );

  return known ? "owner-delegate" : "unknown";
};
