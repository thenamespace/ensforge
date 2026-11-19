import { Context, Effect, Layer } from "effect";

import type { Deployments } from "@ensforge/contracts";
import { Ensforge, ensActions, type Plan } from "@ensforge/sdk";
import type { Indexer } from "@ensforge/sdk/indexer";
import { Devnet } from "@ensforge/test-devnet";
import { createWalletClient, http, type Account, type Address, type Transport } from "viem";

import type { TestWallet } from "./wallets.ts";

/** What a test varies about a client: the signer, its wallet, plan storage, indexer, CCIP-Read. */
export type ClientOptions = {
  /** The signer: a devnet account, or a local account that signs itself (a smart account). */
  readonly account?: Account | Address | undefined;
  /** The account's wallet; the devnet's unlocked account by default. */
  readonly wallet?: TestWallet | undefined;
  /** Where plans are saved; shared between clients to resume across them. */
  readonly storage?: Plan.Storage | undefined;
  readonly indexer?: Indexer | undefined;
  readonly ccipRead?: false | { readonly gatewayUrls?: readonly string[] } | undefined;
  /** Transports of other chains, e.g. an L2 from the `Optimism` service. */
  readonly transports?: Readonly<Record<number, Transport>> | undefined;
  /** The account's wallets on other chains (their own anvils), by chain ID. */
  readonly wallets?: Readonly<Record<number, Ensforge.ViemClientLike>> | undefined;
  /** The deployment profile; the devnet's by default (`Namespaces` adds its L2 namespaces). */
  readonly deployment?: Deployments.Profile | undefined;
};

const makeClient = (devnet: Devnet["Service"], options: ClientOptions) => {
  const transport = http(devnet.rpcUrl);
  const wallets = {
    ...(options.account === undefined
      ? {}
      : {
          [devnet.chain.id]: createWalletClient({
            chain: devnet.chain,
            pollingInterval: 50,
            transport: options.wallet?.transport ?? transport,
            account: options.account,
          }),
        }),
    ...options.wallets,
  };

  return Ensforge.create({
    chain: devnet.chain,
    transports: { [devnet.chain.id]: transport, ...options.transports },
    // Tests never reach a public RPC.
    publicRpc: false,
    // The devnet answers at once; short polling keeps receipt and chain-time waits short.
    pollingInterval: 50,
    deployment: options.deployment ?? devnet.deployments,
    ...(options.ccipRead === undefined ? {} : { ccipRead: options.ccipRead }),
    ...(options.storage === undefined ? {} : { storage: options.storage }),
    ...(options.indexer === undefined ? {} : { indexer: options.indexer }),
    // Each anvil has its own unlocked accounts, so the wallet for a chain is that chain's.
    ...(options.account === undefined
      ? {}
      : { account: options.account, wallet: (chainId: number) => wallets[chainId] }),
  }).extend(ensActions());
};

/** An ensforge client on the devnet. */
export type Client = ReturnType<typeof makeClient>;

/** ensforge clients on the running devnet. */
export class Clients extends Context.Service<
  Clients,
  {
    /** A client without an account, for reads. */
    readonly reader: Client;
    readonly make: (options: ClientOptions) => Client;
  }
  // Service keys are `<package>/<Service>`; this file is not named after the service.
  // oxlint-disable-next-line effecttsgo/deterministic-keys
>()("@ensforge/test-integration/Clients") {
  static readonly layer = Layer.effect(
    Clients,
    Effect.gen(function* () {
      const devnet = yield* Devnet;
      return Clients.of({
        reader: makeClient(devnet, {}),
        make: (options) => makeClient(devnet, options),
      });
    }),
  );
}
