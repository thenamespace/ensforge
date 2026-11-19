// Read synchronously by the lanes' setup, outside any Effect runtime.
/* oxlint-disable effecttsgo/node-builtin-import, effecttsgo/process-env */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Record as Rec } from "effect";

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

const l2Names: Readonly<Record<number, string>> = {
  10: "OP",
  137: "POLYGON",
  480: "WORLDCHAIN",
  4801: "WORLDCHAIN_SEPOLIA",
  8453: "BASE",
  42161: "ARBITRUM",
  42220: "CELO",
  59141: "LINEA_SEPOLIA",
  59144: "LINEA",
  80002: "POLYGON_AMOY",
  84532: "BASE_SEPOLIA",
  421614: "ARBITRUM_SEPOLIA",
  534351: "SCROLL_SEPOLIA",
  534352: "SCROLL",
  11142220: "CELO_SEPOLIA",
  11155420: "OP_SEPOLIA",
};

/**
 * The RPC of each L2 that has one set, by chain ID: `ENSFORGE_<CHAIN>_RPC_URL` (`ENSFORGE_BASE_RPC_URL`,
 * …), from the environment or the repository's `.env`. Other L2s use their public RPC.
 */
export const l2Rpcs = (): Readonly<Record<number, string>> => {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const rpcs: Record<number, string> = {};
  for (const [chainId, name] of Rec.toEntries(l2Names)) {
    const url = process.env[`ENSFORGE_${name}_RPC_URL`];
    if (url !== undefined && url !== "") rpcs[Number(chainId)] = url;
  }
  return rpcs;
};
