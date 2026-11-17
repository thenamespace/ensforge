import { Context, Effect, Layer } from "effect";

import { Ensforge, ensActions, type Plan } from "@ensforge/sdk";
import type { Indexer } from "@ensforge/sdk/indexer";
import { Devnet } from "@ensforge/test-devnet";
import { createPublicClient, createWalletClient, http, type Address } from "viem";

import type { TestWallet } from "./wallets.ts";

/** What a test varies about a client: the signer, its wallet, plan storage, indexer, CCIP-Read. */
export type ClientOptions = {
  readonly account?: Address | undefined;
  /** The account's wallet; the devnet's unlocked account by default. */
  readonly wallet?: TestWallet | undefined;
  /** Where plans are saved; shared between clients to resume across them. */
  readonly storage?: Plan.Storage | undefined;
  readonly indexer?: Indexer | undefined;
  readonly ccipRead?: false | { readonly gatewayUrls?: readonly string[] } | undefined;
};

const makeClient = (devnet: Devnet["Service"], options: ClientOptions) => {
  const transport = http(devnet.rpcUrl);
  // The devnet answers at once; short polling keeps receipt and chain-time waits short.
  const publicClient = createPublicClient({ chain: devnet.chain, transport, pollingInterval: 50 });

  return Ensforge.create({
    publicClient,
    deployment: devnet.deployments,
    ...(options.ccipRead === undefined ? {} : { ccipRead: options.ccipRead }),
    ...(options.storage === undefined ? {} : { storage: options.storage }),
    ...(options.indexer === undefined ? {} : { indexer: options.indexer }),
    ...(options.account === undefined
      ? {}
      : {
          walletClient: createWalletClient({
            chain: devnet.chain,
            pollingInterval: 50,
            transport: options.wallet?.transport ?? transport,
            account: options.account,
          }),
        }),
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
