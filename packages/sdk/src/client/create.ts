import { Deployments } from "@ensforge/contracts";
import {
  BaseError,
  createClient,
  custom,
  http,
  UserRejectedRequestError,
  type Account,
  type Chain,
  type Transport,
} from "viem";
import { getChainId, switchChain } from "viem/actions";

import { ConfigError } from "../errors/classes/ConfigError.js";
import { addressOf } from "../internal/address.js";
import { knownChain } from "../internal/chains.js";
import { resolveConfig } from "./config.js";
import { build } from "./extend.js";
import type { State } from "./state.js";
import type {
  Client,
  CreateOptions,
  ViemClient,
  ViemClientLike,
  ViemWalletClient,
} from "./types.js";

// Options take `ViemClientLike` only to keep app type checking cheap: the clients passed in are
// viem clients, which ensforge calls viem actions with.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every viem client is a `ViemClient`
const viemClient = (client: ViemClientLike): ViemWalletClient => client as ViemWalletClient;

const resolveDeployment = (options: CreateOptions): Deployments.Profile => {
  if (options.deployment !== undefined) {
    try {
      return Deployments.define(options.deployment);
    } catch (cause) {
      throw new ConfigError({ code: "INVALID_DEPLOYMENT", cause });
    }
  }

  const deployment = Deployments.get({ chainId: options.chain.id });
  if (deployment === undefined) {
    throw new ConfigError({
      code: "UNKNOWN_CHAIN",
      context: { chainId: options.chain.id },
      hint: "Pass `deployment` for chains without a built-in ENS deployment.",
    });
  }
  return deployment;
};

const isLocal = (account: CreateOptions["account"]): account is Account =>
  typeof account === "object" && account.type === "local";

// The connected wallet rejecting the switch is the user's answer; any other failure (a wallet
// that cannot switch) leaves the wallet where it is, and the write reports `CHAIN_MISMATCH`.
const rejected = (cause: unknown): boolean =>
  cause instanceof BaseError &&
  cause.walk((error) => error instanceof UserRejectedRequestError) !== null;

/** The chain and transport ensforge reaches `chainId` with, or `undefined` when it cannot. */
const routes = (options: CreateOptions) => {
  const chainOf = (chainId: number): Chain | undefined =>
    chainId === options.chain.id ? options.chain : knownChain(chainId);
  const transportOf = (chainId: number): Transport | undefined => {
    const configured = options.transports?.[chainId];
    if (configured !== undefined) return configured;
    // `http()` without a URL uses the chain's default (public) RPC.
    return options.publicRpc !== false && chainOf(chainId) !== undefined ? http() : undefined;
  };
  return { chainOf, transportOf };
};

const resolveClients = (options: CreateOptions): State["clientOf"] => {
  const { chainOf, transportOf } = routes(options);
  const clients = new Map<number, ViemClient>();

  return (chainId) => {
    const existing = clients.get(chainId);
    if (existing !== undefined) return existing;

    const transport = transportOf(chainId);
    if (transport === undefined) return undefined;
    const client = createClient({
      chain: chainOf(chainId),
      transport,
      ...(options.pollingInterval === undefined
        ? {}
        : { pollingInterval: options.pollingInterval }),
      ...(options.cacheTime === undefined ? {} : { cacheTime: options.cacheTime }),
    });
    clients.set(chainId, client);
    return client;
  };
};

const resolveWallet = (options: CreateOptions): State["walletOn"] => {
  const { chainOf, transportOf } = routes(options);
  const { account, wallet } = options;

  // `walletOn` is a Promise boundary: a wallet can connect after the client is created.
  // oxlint-disable-next-line effecttsgo/async-function
  return async (chainId) => {
    // A local account signs on any chain itself, through that chain's transport.
    if (isLocal(account) && wallet === undefined) {
      const transport = transportOf(chainId);
      return transport === undefined
        ? undefined
        : createClient({ account, chain: chainOf(chainId), transport });
    }

    const current = typeof wallet === "function" ? await wallet(chainId) : wallet;
    if (current === undefined) return undefined;
    const connected = viemClient(current);
    if ((connected.chain?.id ?? (await getChainId(connected))) === chainId) return connected;
    if (options.switchChain === false) return connected;

    try {
      await switchChain(connected, { id: chainId });
    } catch (cause) {
      if (rejected(cause)) throw cause;
      return connected;
    }
    // The wallet's client keeps the chain it was created on; sign through it on the new chain.
    return createClient({
      account: connected.account,
      chain: chainOf(chainId),
      transport: custom({ request: connected.request }),
    });
  };
};

/**
 * Creates an ensforge client.
 *
 * **When to use**
 *
 * Use once, at app start, then add action groups with `extend`.
 *
 * **Details**
 *
 * - `chain` chooses the ENS deployment (mainnet, Sepolia); other chains need `deployment`.
 * - ensforge reads each chain through `transports`, or the chain's public RPC when `transports`
 *   has none for it (`publicRpc`), so names that live on an L2 work without extra setup.
 * - `wallet` signs on every chain, switching chains before a write when needed; a local `account`
 *   signs on any chain itself. `wallet` can be a getter, so a wallet that connects later works.
 * - The client and its `config` are frozen.
 *
 * **Example** (Reading with public RPCs)
 *
 * ```ts
 * import { Ensforge, ensActions } from "@ensforge/sdk"
 * import { mainnet } from "viem/chains"
 *
 * const ens = Ensforge.create({ chain: mainnet }).extend(ensActions())
 * ```
 *
 * **Example** (Your RPCs and a wallet)
 *
 * ```ts
 * import { Ensforge, ensActions } from "@ensforge/sdk"
 * import { http } from "viem"
 * import { base, mainnet } from "viem/chains"
 *
 * const ens = Ensforge.create({
 *   chain: mainnet,
 *   transports: { [mainnet.id]: http(mainnetRpcUrl), [base.id]: http(baseRpcUrl) },
 *   wallet: walletClient,
 * }).extend(ensActions())
 * ```
 *
 * **Example** (A server signer)
 *
 * ```ts
 * import { Ensforge, ensActions } from "@ensforge/sdk"
 * import { http } from "viem"
 * import { privateKeyToAccount } from "viem/accounts"
 * import { mainnet } from "viem/chains"
 *
 * const ens = Ensforge.create({
 *   chain: mainnet,
 *   transports: { [mainnet.id]: http(mainnetRpcUrl) },
 *   account: privateKeyToAccount(privateKey),
 * }).extend(ensActions())
 * ```
 *
 * **Example** (A devnet)
 *
 * ```ts
 * import { Deployments } from "@ensforge/contracts"
 * import { Ensforge } from "@ensforge/sdk"
 * import { http } from "viem"
 * import { foundry } from "viem/chains"
 *
 * const ens = Ensforge.create({
 *   chain: foundry,
 *   transports: { [foundry.id]: http("http://127.0.0.1:8545") },
 *   deployment: Deployments.define({ name: "devnet", chainId: 31337, v2: devnetV2 }),
 * })
 * ```
 *
 * @throws `Errors.ConfigError` (`UNKNOWN_CHAIN`) when the chain has no built-in deployment and none is given.
 * @throws `Errors.ConfigError` (`INVALID_DEPLOYMENT`) when `deployment` is invalid or for another chain.
 * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) when the ENS chain has no transport and `publicRpc` is `false`.
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export const create = (options: CreateOptions): Client => {
  const deployment = resolveDeployment(options);
  if (deployment.chainId !== options.chain.id) {
    throw new ConfigError({
      code: "INVALID_DEPLOYMENT",
      shortMessage: `The deployment is for chain ${deployment.chainId}, but \`chain\` is ${options.chain.id}.`,
    });
  }

  const clientOf = resolveClients(options);
  if (clientOf(options.chain.id) === undefined) {
    throw new ConfigError({
      code: "CHAIN_NOT_CONFIGURED",
      context: { chainId: options.chain.id },
      hint: "Add the ENS chain to `transports`, or leave `publicRpc` on.",
    });
  }

  const walletAccount =
    typeof options.wallet === "object" ? viemClient(options.wallet).account : undefined;
  return build(
    {
      chain: Object.freeze({ id: options.chain.id, name: options.chain.name }),
      account: addressOf(options.account) ?? addressOf(walletAccount),
      deployment,
      config: resolveConfig(options),
    },
    {
      clientOf,
      walletOn: resolveWallet(options),
      signer: options.account ?? walletAccount,
    },
  );
};
