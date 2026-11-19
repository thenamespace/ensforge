import { Array as Arr, Option } from "effect";

import { Deployments } from "@ensforge/contracts";
import { custom, type Transport } from "viem";
import type { Config as WagmiConfig } from "wagmi";
import { getConnectorClient, getPublicClient, switchChain } from "wagmi/actions";

import { create } from "../client/create.js";
import type { Client, CreateOptions, ViemWalletClient } from "../client/types.js";
import { ConfigError } from "../errors/classes/ConfigError.js";

// The ENS chain: an explicit one, mainnet when the app has it, or the first chain ensforge
// ships a deployment for.
const chainIdOf = (config: WagmiConfig, options: fromWagmi.Options): number => {
  const configured = Arr.map(config.chains, (chain) => chain.id);
  const chainId =
    options.chainId ??
    options.deployment?.chainId ??
    (configured.includes(1)
      ? 1
      : Option.getOrUndefined(
          Arr.findFirst(configured, (id) => Deployments.get({ chainId: id }) !== undefined),
        ));

  if (chainId === undefined) {
    throw new ConfigError({
      code: "UNKNOWN_CHAIN",
      context: { chainId: configured[0] },
      hint: "Add mainnet to the wagmi config's chains, or pass `chainId` with a `deployment`.",
    });
  }
  return chainId;
};

/**
 * Creates an ensforge client from a wagmi config: reads use wagmi's client for the ENS chain, and
 * writes use whichever wallet is connected when they run.
 *
 * **When to use**
 *
 * Use in apps that already have a wagmi config (RainbowKit, ConnectKit, Dynamic, Privy, Reown
 * AppKit), instead of passing viem clients to `Ensforge.create`.
 *
 * **Details**
 *
 * - Works with wagmi 2 and 3.
 * - The ENS chain is `chainId`, else mainnet when the config has it, else the first configured
 *   chain ensforge has a deployment for. Its transport must be in the wagmi config.
 * - The wallet is looked up on every write, so account and connector changes are followed. With
 *   no wallet connected, writes fail with `WALLET_NOT_CONFIGURED`.
 * - A wallet on another chain is asked to switch first, as wagmi's own `writeContract` does.
 * - Every other chain of the wagmi config becomes one of the client's `chains`, so writes ENS
 *   makes there (an L2 primary name) use wagmi's clients and wallet; `chains` adds or overrides.
 * - Names on an L2 (Basenames, Linea Names, Celonames, Durin, Namespace) and L2 primary names are
 *   read on chains the config lacks through public RPCs, but written only on chains the config
 *   has: a write elsewhere fails with `CHAIN_NOT_CONFIGURED` before the wallet is asked.
 *
 * **Gotchas**
 *
 * - `fromWagmi` lives on the `Ensforge` from `@ensforge/sdk/wagmi`, so apps without wagmi never
 *   load it. The client it returns works with everything in `@ensforge/sdk`.
 *
 * **Example** (A client for a wagmi app)
 *
 * ```ts
 * import { ensActions } from "@ensforge/sdk"
 * import { Ensforge } from "@ensforge/sdk/wagmi"
 *
 * const ens = Ensforge.fromWagmi(wagmiConfig).extend(ensActions())
 * await ens.record.set({ name: "alice.eth", texts: { url: "https://alice.xyz" } })
 * ```
 *
 * **Example** (Sepolia, without automatic chain switching)
 *
 * ```ts
 * import { Ensforge } from "@ensforge/sdk/wagmi"
 *
 * const ens = Ensforge.fromWagmi(wagmiConfig, { chainId: 11155111, switchChain: false })
 * ```
 *
 * @throws `Errors.ConfigError` (`UNKNOWN_CHAIN`) when no ENS chain can be chosen or the wagmi
 * config has no transport for it.
 * @throws `Errors.ConfigError` (`INVALID_DEPLOYMENT`) when `deployment` is invalid or for another chain.
 * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) on a write on a chain the wagmi config does not have.
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export const fromWagmi = (config: WagmiConfig, options: fromWagmi.Options = {}): Client => {
  const { chainId: _chainId, switchChain: autoSwitch = true, ...createOptions } = options;
  const chainId = chainIdOf(config, options);
  const chain = Option.getOrUndefined(Arr.findFirst(config.chains, ({ id }) => id === chainId));
  const publicClient = chain === undefined ? undefined : getPublicClient(config, { chainId });
  if (chain === undefined || publicClient === undefined) {
    throw new ConfigError({
      code: "UNKNOWN_CHAIN",
      context: { chainId },
      hint: `Add chain ${chainId} and its transport to the wagmi config.`,
    });
  }

  // The connected wallet, on `target` when it switches; looked up on every write. wagmi's actions
  // are Promises, and so is `getWalletClient`.
  // oxlint-disable-next-line effecttsgo/async-function
  const walletOn = async (target: number): Promise<ViemWalletClient | undefined> => {
    try {
      const connected = await getConnectorClient(config);
      if (!autoSwitch || connected.chain.id === target) return connected;
      // wagmi switches only to chains in its config; reads on others still use public RPCs.
      const known = Option.getOrUndefined(Arr.findFirst(config.chains, ({ id }) => id === target));
      if (known === undefined) {
        throw new ConfigError({
          code: "CHAIN_NOT_CONFIGURED",
          context: { chainId: target },
          hint: `Add chain ${target} to the wagmi config so the wallet can switch to it and sign there.`,
        });
      }

      await switchChain(config, { chainId: target });
      return await getConnectorClient(config, { chainId: target });
    } catch (cause) {
      // wagmi 2 and 3 both throw this without a connected wallet: no wallet, not a failure.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- wagmi errors are untyped
      if ((cause as { readonly name?: unknown } | null)?.name === "ConnectorNotConnectedError") {
        return undefined;
      }
      throw cause;
    }
  };

  // ensforge reads every chain the wagmi config has through wagmi's own clients (its transports).
  const transports: Record<number, Transport> = {};
  for (const { id } of config.chains) {
    const client = getPublicClient(config, { chainId: id });
    if (client !== undefined) transports[id] = custom({ request: client.request });
  }

  return create({
    pollingInterval: publicClient.pollingInterval,
    ...createOptions,
    chain,
    transports: { ...transports, ...createOptions.transports },
    wallet: walletOn,
    switchChain: autoSwitch,
  });
};

export declare namespace fromWagmi {
  /** Options for {@link fromWagmi}: those of `Ensforge.create`, with the chain and wallet from wagmi. */
  type Options = Omit<CreateOptions, "chain" | "wallet"> & {
    /**
     * The ENS chain.
     *
     * @default mainnet when configured, else the first configured chain with a built-in deployment
     */
    chainId?: number | undefined;
  };
}
