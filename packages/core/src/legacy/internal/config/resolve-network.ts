import { Exit, Schema } from "effect";

import type { EnsDeploymentProfile } from "../../config/config.js";
import { ensChainIds, EnsNetworkSchema, type EnsNetwork } from "../../config/network.js";
import { ConfigError } from "../../errors/config-error.js";
import { CustomEnsNetworkSchema } from "./custom-network-schema.js";
import { getNetworkProfile } from "./network-profile.js";

interface ResolvedNetwork {
  readonly network: string;
  readonly chainId: number;
  readonly preset: EnsNetwork | undefined;
  readonly deployments: EnsDeploymentProfile;
}

// Freeze the owned snapshot so routing cannot change after configuration validation.
export const freezeDeployment = <T extends object>(value: T): T => {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") freezeDeployment(child);
  }

  return Object.freeze(value);
};

export const resolveNetwork = (input: unknown): ResolvedNetwork => {
  if (Schema.is(EnsNetworkSchema)(input)) {
    return {
      network: input,
      chainId: ensChainIds[input],
      preset: input,
      deployments: getNetworkProfile(input),
    };
  }

  if (typeof input === "string") {
    throw new ConfigError({
      code: "UNSUPPORTED_NETWORK",
      message: `Unsupported ENS network: ${input}`,
    });
  }

  const decoded = Schema.decodeUnknownExit(CustomEnsNetworkSchema)(input);

  if (Exit.isFailure(decoded)) {
    throw new ConfigError({
      code: "INVALID_CUSTOM_NETWORK",
      message:
        "Provide a custom network ID, a positive safe chain ID, and complete valid contract address groups for the selected protocol",
    });
  }

  const custom = structuredClone(decoded.value);

  if (Schema.is(EnsNetworkSchema)(custom.id)) {
    throw new ConfigError({
      code: "INVALID_CUSTOM_NETWORK",
      message: "Custom network IDs must not reuse mainnet or sepolia",
    });
  }

  const metadata = { chainId: custom.chainId };

  const v1 =
    custom.v1 === undefined
      ? undefined
      : {
          ...custom.v1,
          ...metadata,
          id: `${custom.id}:v1`,
          protocol: "v1" as const,
          status: custom.v1.status ?? "active",
        };

  const deployments: EnsDeploymentProfile =
    custom.protocol === "v1"
      ? {
          protocol: "v1",
          v1: {
            ...custom.v1,
            ...metadata,
            id: `${custom.id}:v1`,
            protocol: "v1",
            status: custom.v1.status ?? "active",
          },
        }
      : {
          protocol: "v2",
          ...(v1 === undefined ? {} : { v1 }),
          v2: {
            ...custom.v2,
            ...metadata,
            id: `${custom.id}:v2`,
            protocol: "v2",
            status: custom.v2.status ?? "active",
          },
        };

  return {
    network: custom.id,
    chainId: custom.chainId,
    preset: undefined,
    deployments: freezeDeployment(deployments),
  };
};
