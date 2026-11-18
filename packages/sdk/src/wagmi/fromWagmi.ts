import { Array as Arr, Option } from "effect";

import { Deployments } from "@ensforge/contracts";
import type { Config as WagmiConfig } from "wagmi";
import { getConnectorClient, getPublicClient, switchChain } from "wagmi/actions";

import { create } from "../client/create.js";
import type { ChainClients, Client, CreateOptions, ViemWalletClient } from "../client/types.js";
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
 * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) when an entry of `chains` holds clients of another chain.
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export const fromWagmi = (config: WagmiConfig, options: fromWagmi.Options = {}): Client => {
  const { chainId: _chainId, switchChain: autoSwitch = true, ...createOptions } = options;
  const chainId = chainIdOf(config, options);

  const publicClient = getPublicClient(config, { chainId });
  if (publicClient === undefined) {
    throw new ConfigError({
      code: "UNKNOWN_CHAIN",
      context: { chainId },
      hint: `Add chain ${chainId} and its transport to the wagmi config.`,
    });
  }

  // The connected wallet, on `target` when it switches; looked up on every write. wagmi's actions
  // are Promises, and so is `getWalletClient`.
  // oxlint-disable-next-line effecttsgo/async-function
  const walletOn = (target: number) => async (): Promise<ViemWalletClient | undefined> => {
    try {
      const connected = await getConnectorClient(config);
      if (!autoSwitch || connected.chain.id === target) return connected;

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

  const chains: Record<number, ChainClients> = {};
  for (const { id } of config.chains) {
    const chainClient = id === chainId ? undefined : getPublicClient(config, { chainId: id });
    if (chainClient !== undefined) {
      chains[id] = { publicClient: chainClient, walletClient: walletOn(id) };
    }
  }

  return create({
    ...createOptions,
    publicClient,
    walletClient: walletOn(chainId),
    chains: { ...chains, ...createOptions.chains },
  });
};

export declare namespace fromWagmi {
  /** Options for {@link fromWagmi}: those of `Ensforge.create`, without the viem clients. */
  type Options = Omit<CreateOptions, "publicClient" | "walletClient"> & {
    /**
     * The ENS chain.
     *
     * @default mainnet when configured, else the first configured chain with a built-in deployment
     */
    chainId?: number | undefined;
    /**
     * Ask the wallet to switch to the ENS chain before a write. With `false`, a wallet on another
     * chain fails with `WalletError` (`CHAIN_MISMATCH`).
     *
     * @default true
     */
    switchChain?: boolean | undefined;
  };
}
