import { Array as Arr, Record as Rec } from "effect";

import { Deployments } from "@ensforge/contracts";

import { ConfigError } from "../errors/classes/ConfigError.js";
import { addressOf } from "../internal/address.js";
import { resolveConfig } from "./config.js";
import { build } from "./extend.js";
import type { State } from "./state.js";
import type { ChainClients, Client, CreateOptions, ViemClient, ViemClientLike } from "./types.js";

// Options take `ViemClientLike` only to keep app type checking cheap: the clients passed in are
// viem clients, which ensforge calls viem actions with.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every viem client is a `ViemClient`
const viemClient = (client: ViemClientLike): ViemClient => client as ViemClient;

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

const resolveWallet = ({ walletClient, publicClient }: ChainClients): State["getWalletClient"] => {
  // `getWalletClient` is a Promise boundary: a wallet can connect after the client is created.
  /* oxlint-disable effecttsgo/async-function */
  if (typeof walletClient === "function")
    return async () => {
      const wallet = await walletClient();
      return wallet === undefined ? undefined : viemClient(wallet);
    };
  if (walletClient !== undefined) return async () => viemClient(walletClient);
  if (publicClient.account !== undefined) return async () => viemClient(publicClient);
  return async () => undefined;
  /* oxlint-enable effecttsgo/async-function */
};

const resolveChains = (options: CreateOptions): State["chains"] =>
  new Map(
    Arr.map(Rec.toEntries(options.chains ?? {}), ([key, clients]) => {
      const chainId = Number(key);
      const actual = clients.publicClient.chain?.id;
      if (actual !== undefined && actual !== chainId) {
        throw new ConfigError({
          code: "CHAIN_NOT_CONFIGURED",
          context: { chainId },
          shortMessage: `\`chains[${chainId}]\` has a public client for chain ${actual}.`,
          hint: "Key each entry of `chains` by the chain ID of its clients.",
        });
      }
      return [
        chainId,
        {
          publicClient: viemClient(clients.publicClient),
          getWalletClient: resolveWallet(clients),
        },
      ];
    }),
  );

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
 * - `chains` adds clients for other chains, for the writes ENS makes there: primary names on L2s
 *   (`primaryName.set` with `coin: { chainId }`).
 * - The client and its `config` are frozen.
 *
 * **Example** (Creating a client)
 *
 * ```ts
 * import { Ensforge, ensActions } from "@ensforge/sdk"
 *
 * const ens = Ensforge.create({ publicClient, walletClient }).extend(ensActions())
 * ```
 *
 * **Example** (A devnet)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 * import { Ensforge } from "@ensforge/sdk"
 *
 * const ens = Ensforge.create({
 *   publicClient: anvil,
 *   deployment: Deployments.define({ name: "devnet", chainId: 31337, v2: devnetV2 }),
 * })
 * ```
 *
 * **Example** (Adding an L2 for primary names)
 *
 * ```ts
 * import { Ensforge, ensActions } from "@ensforge/sdk"
 *
 * const ens = Ensforge.create({
 *   publicClient,
 *   walletClient,
 *   chains: { 10: { publicClient: optimismClient, walletClient: optimismWallet } },
 * }).extend(ensActions())
 *
 * await ens.primaryName.set({ name: "alice.eth", coin: { chainId: 10 } })
 * ```
 *
 * @throws `Errors.ConfigError` (`UNKNOWN_CHAIN`) when the chain has no built-in deployment and none is given.
 * @throws `Errors.ConfigError` (`INVALID_DEPLOYMENT`) when `deployment` is invalid or for another chain.
 * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) when an entry of `chains` holds clients of another chain.
 * @stability stable
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
      publicClient: viemClient(options.publicClient),
      config: resolveConfig(options),
    },
    {
      getWalletClient: resolveWallet(options),
      signer: signer ?? walletAccount,
      chains: resolveChains(options),
    },
  );
};
