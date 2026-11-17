import { Deployments } from "@ensforge/contracts";

import type { EnsDeploymentProfile } from "../../config/config.js";
import type { EnsNetwork } from "../../config/network.js";

const mainnetProfile: EnsDeploymentProfile = Object.freeze({
  protocol: "v1",
  v1: Deployments.mainnet.v1,
});

const sepoliaProfile: EnsDeploymentProfile = Object.freeze({
  protocol: "v2",
  v1: Deployments.sepolia.v1,
  v2: Deployments.sepolia.v2,
});

const networkProfiles: Readonly<Record<EnsNetwork, EnsDeploymentProfile>> = Object.freeze({
  mainnet: mainnetProfile,
  sepolia: sepoliaProfile,
});

export const getNetworkProfile = (network: EnsNetwork): EnsDeploymentProfile =>
  networkProfiles[network];
