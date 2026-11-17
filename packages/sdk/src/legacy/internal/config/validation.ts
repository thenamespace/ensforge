import type { EnsDeployment, EnsDeploymentProfile } from "../../config/config.js";
import { ConfigError } from "../../errors/config-error.js";

export type ClientKind = "public" | "wallet";

export const validateClientChain = (
  client: { readonly chain: { readonly id: number } | undefined },
  clientKind: ClientKind,
  network: string,
  expectedChainId: number,
): void => {
  if (client.chain === undefined) {
    throw new ConfigError({
      code: "CLIENT_CHAIN_UNAVAILABLE",
      message: `The ${clientKind} client must be configured with a chain`,
    });
  }

  if (client.chain.id !== expectedChainId) {
    throw new ConfigError({
      code: "NETWORK_CLIENT_MISMATCH",
      message: `The ${clientKind} client chain ${client.chain.id} does not match ${network} (${expectedChainId})`,
    });
  }
};

const getProfileDeployments = (profile: EnsDeploymentProfile): readonly EnsDeployment[] => {
  switch (profile.protocol) {
    case "v1":
      return [profile.v1];
    case "v2":
      return profile.v1 === undefined ? [profile.v2] : [profile.v1, profile.v2];
  }
};

export const validateDeployments = (
  profile: EnsDeploymentProfile,
  expectedChainId: number,
): void => {
  const deploymentIds = new Set<string>();

  for (const deployment of getProfileDeployments(profile)) {
    if (deployment.chainId !== expectedChainId) {
      throw new ConfigError({
        code: "DEPLOYMENT_CHAIN_MISMATCH",
        message: `Deployment ${deployment.id} targets chain ${deployment.chainId}, expected ${expectedChainId}`,
      });
    }

    if (deploymentIds.has(deployment.id)) {
      throw new ConfigError({
        code: "DUPLICATE_DEPLOYMENT",
        message: `Deployment ${deployment.id} appears more than once in the selected profile`,
      });
    }

    deploymentIds.add(deployment.id);
  }
};
