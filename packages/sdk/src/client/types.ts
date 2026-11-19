import type { Deployments } from "@ensforge/contracts";
import type {
  Account,
  Address,
  BlockTag,
  Chain,
  EIP1193RequestFn,
  Client as ViemBaseClient,
  Transport,
} from "viem";

import type { Indexer } from "../indexer/Indexer.js";
import type { Plan } from "../plan/Plan.js";

/**
 * A viem client used for reads. viem's base client type keeps type checking fast; any
 * `PublicClient` or `WalletClient` fits.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- the literal or explicit type argument documents the public type
export type ViemClient = ViemBaseClient<Transport, Chain | undefined>;

/**
 * A viem client that can sign: any `WalletClient`, or a client created with an account.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- the literal or explicit type argument documents the public type
export type ViemWalletClient = ViemBaseClient<Transport, Chain | undefined, Account | undefined>;

/**
 * A viem client as ensforge's options and actions take it: any `PublicClient`, `WalletClient` or
 * `createClient` client fits. It leaves out viem's generic `extend` and typed `request`, so app
 * code that creates a client inline (`wallet: createWalletClient(...)`) does not make the
 * type checker infer viem's generics against them (about 120k type instantiations).
 *
 * @stability stable
 * @category client
 * @since 1.1.0
 */
export type ViemClientLike = Pick<
  ViemWalletClient,
  | "account"
  | "batch"
  | "cacheTime"
  | "ccipRead"
  | "chain"
  | "key"
  | "name"
  | "pollingInterval"
  | "transport"
  | "type"
  | "uid"
> & { readonly request: EIP1193RequestFn };

/**
 * HTTP gateways that turn decentralized-storage URIs (avatars, content hashes) into URLs a
 * browser can load. Each is an origin, such as `https://ipfs.io`.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export type Gateways = {
  /**
   * IPFS gateway, for `ipfs://`, `ipns://` and bare CIDs. The public `ipfs.io` is rate limited:
   * use a dedicated gateway in production.
   *
   * @default "https://ipfs.io"
   */
  readonly ipfs?: string | undefined;
  /**
   * Arweave gateway, for `ar://`.
   *
   * @default "https://arweave.net"
   */
  readonly arweave?: string | undefined;
  /**
   * Swarm gateway, for `bzz://` content hashes.
   *
   * @default "https://api.gateway.ethswarm.org"
   */
  readonly swarm?: string | undefined;
};

/**
 * Behaviour settings, set once in `Ensforge.create` and rarely read back.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export type Config = {
  /** Off-chain resolution (CCIP-Read) through the Universal Resolver's batch gateways. `false` disables it. */
  readonly ccipRead: { readonly gatewayUrls: readonly string[] } | false;
  /** Coalescing of concurrent contract reads into multicall. */
  readonly batch: {
    readonly multicall: false | { readonly batchSize: number; readonly wait: number };
  };
  /** Default block tag for reads. */
  readonly blockTag: BlockTag;
  /** Where multi-step plans save their progress. */
  readonly storage: Plan.Storage;
  /** Whether writes are simulated before the wallet prompt. */
  readonly simulate: boolean;
  /** Indexer for `indexer.*` actions and migration discovery, when configured. */
  readonly indexer: Indexer | undefined;
  /** Storage gateways for avatars and content-hash URLs, defaults filled in. */
  readonly gateways: { readonly [protocol in keyof Gateways]-?: string };
};

/**
 * The ensforge client. Its top level holds what app code reads day to day and `extend`; action
 * groups added by `extend` sit beside them.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export type Client<actions extends object = {}> = actions & ClientBase<actions>;

/**
 * Members every ensforge client has, whatever action groups it carries.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export interface ClientBase<actions extends object = {}> {
  /** The chain the client reads and writes ENS on. */
  readonly chain: { readonly id: number; readonly name: string };
  /** Default signer address, or `undefined` without a wallet. */
  readonly account: Address | undefined;
  /** ENS deployments on this chain (addresses, capabilities, provenance). */
  readonly deployment: Deployments.Profile;
  /**
   * The viem client ensforge reads a chain with, as an escape hatch: the ENS chain's by default.
   *
   * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) when the chain has no transport and no
   * public RPC (`publicRpc: false`, or a chain ensforge does not know).
   */
  readonly client: (chainId?: number) => ViemClient;
  /** The configuration the client was created with. */
  readonly config: Config;
  /** Adds action groups; returns a new client. */
  readonly extend: <const added extends object>(
    decorator: (client: Client<actions>) => added,
  ) => Client<actions & added>;
}

/**
 * Anything an action accepts: an ensforge client or a bare viem client.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export type Like = Client<object> | ViemClientLike;

/**
 * Options for `Ensforge.create`.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export type CreateOptions = {
  /** The chain ENS lives on (`mainnet` or `sepolia` from `viem/chains`); it selects the deployment. */
  chain: Chain;
  /**
   * RPC transports by chain ID, the ENS chain included: `{ [mainnet.id]: http(url) }`. Reuse a
   * viem client with `custom(client)`.
   *
   * @default each chain's public RPC (see `publicRpc`)
   */
  transports?: Readonly<Record<number, Transport>> | undefined;
  /**
   * Use a chain's public RPC when `transports` has none for it: `chain`'s own for the ENS chain,
   * viem's for the chains L2 namespaces live on. Public RPCs are rate limited; pass `transports`
   * in production. With `false`, reaching a chain without a transport fails with
   * `CHAIN_NOT_CONFIGURED`.
   *
   * @default true
   */
  publicRpc?: boolean | undefined;
  /**
   * The wallet that signs writes on every chain, or a getter for wallets that connect later. A
   * getter receives the chain the write is sent on and returns a wallet on it.
   *
   * @default none: writes need `account` set to a local account, or fail with `WALLET_NOT_CONFIGURED`
   */
  wallet?:
    | ViemClientLike
    | ((chainId: number) => ViemClientLike | undefined | Promise<ViemClientLike | undefined>)
    | undefined;
  /**
   * Ask `wallet` to switch chains before a write on another chain (`wallet_switchEthereumChain`).
   * With `false`, a wallet on another chain fails with `WalletError` (`CHAIN_MISMATCH`).
   *
   * @default true
   */
  switchChain?: boolean | undefined;
  /**
   * The signer. A local account (`privateKeyToAccount(key)`) signs on any chain itself, through
   * that chain's transport; an address selects the wallet's account.
   *
   * @default the wallet's account
   */
  account?: Account | Address | undefined;
  /**
   * Polling interval of the clients ensforge builds, in milliseconds (receipts, block numbers).
   *
   * @default viem's (4 seconds)
   */
  pollingInterval?: number | undefined;
  /**
   * How long the clients ensforge builds cache block numbers, in milliseconds.
   *
   * @default `pollingInterval`
   */
  cacheTime?: number | undefined;
  /**
   * ENS deployments. Required for chains ensforge does not ship (devnets, forks, other chains).
   *
   * @default `Deployments.get({ chainId })`
   */
  deployment?: Deployments.Profile | undefined;
  /**
   * Off-chain resolution. `false` disables CCIP-Read. `gatewayUrls` are the Universal Resolver's
   * batch gateways and replace its default, not the gateways of individual resolvers.
   *
   * @default the Universal Resolver's own batch gateway
   */
  ccipRead?: { readonly gatewayUrls?: readonly string[] | undefined } | false | undefined;
  /**
   * Coalesce concurrent reads into multicall. `wait` is in milliseconds.
   *
   * @default { multicall: true }
   */
  batch?:
    | {
        readonly multicall?:
          | boolean
          | { readonly batchSize?: number; readonly wait?: number }
          | undefined;
      }
    | undefined;
  /**
   * Default block tag for reads.
   *
   * @default "latest"
   */
  blockTag?: BlockTag | undefined;
  /**
   * Where multi-step plans save their progress.
   *
   * @default Plan.memoryStorage()
   */
  storage?: Plan.Storage | undefined;
  /**
   * Simulate writes before the wallet prompt.
   *
   * @default true
   */
  simulate?: boolean | undefined;
  /**
   * Indexer for `indexer.*` actions and for discovering records and subnames during migration:
   * `bigname()`, `goldsky()`, `fallback([...])` or `defineIndexer({...})` from
   * `@ensforge/sdk/indexer`.
   *
   * @default none; indexer actions fail with `INDEXER_NOT_CONFIGURED`
   */
  indexer?: Indexer | undefined;
  /**
   * Storage gateways for avatars (`record.getAvatar`) and content-hash URLs
   * (`ContentHash.toGatewayUrl(uri, ens.config.gateways)`). A call's own `gateways` override them.
   *
   * @default https://ipfs.io, https://arweave.net and https://api.gateway.ethswarm.org
   */
  gateways?: Gateways | undefined;
};
