// Read synchronously by the lanes' setup, outside any Effect runtime.
/* oxlint-disable effecttsgo/node-builtin-import, effecttsgo/process-env */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A public network the fork and live lanes reach. */
export type Network = "mainnet" | "sepolia";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));

/**
 * The archive RPC of `network`: `ENSFORGE_MAINNET_RPC_URL` or `ENSFORGE_SEPOLIA_RPC_URL`, from the
 * environment or the repository's `.env`. `url` is `undefined` when it is not set.
 */
export const networkRpc = (network: Network) => {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const variable = network === "mainnet" ? "ENSFORGE_MAINNET_RPC_URL" : "ENSFORGE_SEPOLIA_RPC_URL";
  const url = process.env[variable];
  return { variable, url: url === "" ? undefined : url };
};
