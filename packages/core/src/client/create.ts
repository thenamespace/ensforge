import { Deployments } from "@ensforge/contracts";
import type { Account, Address } from "viem";

import { ConfigError } from "../errors/classes/ConfigError.js";
import { resolveConfig } from "./config.js";
import { build } from "./extend.js";
import type { State } from "./state.js";
import type { Client, CreateOptions } from "./types.js";

const resolveDeployment = (
  options: CreateOptions,
  chainId: number | undefined,
): Deployments.Profile => {
  if (options.deployment !== undefined) {
    try {
      return Deployments.define(options.deployment);
    } catch (cause) {
      throw new ConfigError({ code: "INVALID_DEPLOYMENT", cause });
    }
  }

  const deployment = chainId === undefined ? undefined : Deployments.get({ chainId });
  if (deployment === undefined) {
    throw new ConfigError({
      code: "UNKNOWN_CHAIN",
      context: { chainId },
      ...(chainId === undefined
        ? { hint: "Create the viem client with a `chain`, or pass `deployment`." }
        : {}),
    });
  }
  return deployment;
};

const resolveWallet = (options: CreateOptions): State["getWalletClient"] => {
  const { walletClient, publicClient } = options;

  if (typeof walletClient === "function") return async () => walletClient();
  if (walletClient !== undefined) return async () => walletClient;
  if (publicClient.account !== undefined) return async () => publicClient;
  return async () => undefined;
};

const addressOf = (account: Account | Address | undefined): Address | undefined =>
  typeof account === "object" ? account.address : account;

/**
 * Creates an ensforge client from viem clients.
 *
 * **When to use**
 *
 * Use once per chain, at app start, then add action groups with `extend`.
 *
 * **Details**
 *
 * - The deployment is chosen by chain ID (mainnet, Sepolia); other chains need `deployment`.
 * - `walletClient` can be a getter, so a wallet that connects later works.
 * - The client and its `config` are frozen.
 *
 * **Example** (Creating a client)
 *
 * ```ts
 * import { Ensforge, ensActions } from "@ensforge/core"
 *
 * const ens = Ensforge.create({ publicClient, walletClient }).extend(ensActions())
 * ```
 *
 * **Example** (A devnet)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 * import { Ensforge } from "@ensforge/core"
 *
 * const ens = Ensforge.create({
 *   publicClient: anvil,
 *   deployment: Deployments.define({ name: "devnet", chainId: 31337, v2: devnetV2 }),
 * })
 * ```
 *
 * @throws `Errors.ConfigError` (`UNKNOWN_CHAIN`) when the chain has no built-in deployment and none is given.
 * @throws `Errors.ConfigError` (`INVALID_DEPLOYMENT`) when `deployment` is invalid or for another chain.
 * @category client
 * @since 1.0.0
 */
export const create = (options: CreateOptions): Client => {
  const chainId = options.publicClient.chain?.id ?? options.deployment?.chainId;
  const deployment = resolveDeployment(options, chainId);

  if (chainId !== deployment.chainId) {
    throw new ConfigError({
      code: "INVALID_DEPLOYMENT",
      shortMessage: `The deployment is for chain ${deployment.chainId}, but the client is on chain ${chainId}.`,
    });
  }

  const signer = options.account ?? options.publicClient.account;
  const walletAccount =
    typeof options.walletClient === "object" ? options.walletClient.account : undefined;

  return build(
    {
      chain: Object.freeze({
        id: chainId,
        name: options.publicClient.chain?.name ?? deployment.name,
      }),
      account: addressOf(signer) ?? addressOf(walletAccount),
      deployment,
      publicClient: options.publicClient,
      config: resolveConfig(options),
    },
    { getWalletClient: resolveWallet(options), signer: signer ?? walletAccount },
  );
};
