import type { Deployments } from "@ensforge/contracts";
import type { Account, Address, BlockTag, Chain, Client as ViemBaseClient, Transport } from "viem";

import type { Indexer } from "../indexer/Indexer.js";
import type { Plan } from "../plan/Plan.js";

/**
 * A viem client used for reads. viem's base client type keeps type checking fast; any
 * `PublicClient` or `WalletClient` fits.
 *
 * @category client
 * @since 1.0.0
 */
export type ViemClient = ViemBaseClient<Transport, Chain | undefined>;

/**
 * A viem client that can sign: any `WalletClient`, or a client created with an account.
 *
 * @category client
 * @since 1.0.0
 */
export type ViemWalletClient = ViemBaseClient<Transport, Chain | undefined, Account | undefined>;

/**
 * HTTP gateways that turn decentralized-storage URIs (avatars, content hashes) into URLs a
 * browser can load. Each is an origin, such as `https://ipfs.io`.
 *
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
 * @category client
 * @since 1.0.0
 */
export type Config = {
  /** Off-chain resolution (CCIP-Read). `false` disables it. */
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
 * @category client
 * @since 1.0.0
 */
export type Client<actions extends object = {}> = actions & ClientBase<actions>;

/**
 * Members every ensforge client has, whatever action groups it carries.
 *
 * @category client
 * @since 1.0.0
 */
export interface ClientBase<actions extends object = {}> {
  readonly chain: { readonly id: number; readonly name: string };
  /** Default signer address, or `undefined` without a wallet. */
  readonly account: Address | undefined;
  /** ENS deployments on this chain (addresses, capabilities, provenance). */
  readonly deployment: Deployments.Profile;
  /** The viem client used for reads, as an escape hatch. */
  readonly publicClient: ViemClient;
  readonly config: Config;
  /** Adds action groups; returns a new client. */
  readonly extend: <const added extends object>(
    decorator: (client: Client<actions>) => added,
  ) => Client<actions & added>;
}

/**
 * Anything an action accepts: an ensforge client or a bare viem client.
 *
 * @category client
 * @since 1.0.0
 */
export type Like = Client<object> | ViemClient;

/**
 * Options for `Ensforge.create`.
 *
 * @category client
 * @since 1.0.0
 */
export type CreateOptions = {
  /** viem client for reads. Its chain selects the deployment. */
  publicClient: ViemClient;
  /**
   * viem client for writes, or a getter for wallets that change (wagmi connectors).
   *
   * @default `publicClient` when it has an account
   */
  walletClient?:
    | ViemWalletClient
    | (() => ViemWalletClient | undefined | Promise<ViemWalletClient | undefined>)
    | undefined;
  /**
   * Default signer for writes.
   *
   * @default the wallet client's account
   */
  account?: Account | Address | undefined;
  /**
   * ENS deployments. Required for chains ensforge does not ship (devnets, forks, other chains).
   *
   * @default `Deployments.get({ chainId })`
   */
  deployment?: Deployments.Profile | undefined;
  /**
   * Off-chain resolution. `false` disables CCIP-Read.
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
