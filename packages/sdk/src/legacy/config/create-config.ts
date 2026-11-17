import { ConfigError } from "../errors/config-error.js";
import { createConfigFromClients } from "../internal/config/create-config.js";
import type { CreateConfigParameters, EnsforgeConfig } from "./config.js";

export const createConfig = (parameters: CreateConfigParameters): EnsforgeConfig => {
  if (parameters.publicClient === undefined) {
    throw new ConfigError({
      code: "INVALID_CLIENT_CONFIGURATION",
      message: "Provide a Viem public client",
    });
  }

  return createConfigFromClients(
    parameters,
    parameters.publicClient,
    parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient },
  );
};
