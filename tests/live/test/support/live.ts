import { layer } from "@effect/vitest";
import { Context, Effect, Layer, Record as Rec, Schema, String as Str } from "effect";

import { Ensforge, ensActions } from "@ensforge/sdk";
import { bigname, goldsky, type Indexer } from "@ensforge/sdk/indexer";
import { l2Rpcs, networkRpc, type Network } from "@ensforge/test-harness/networks";
import { http, type Address, type Client, type Hex } from "viem";
import { getBlockNumber, getStorageAt } from "viem/actions";
import { mainnet, sepolia } from "viem/chains";

/** The live suites cannot run (no RPC URL), or an RPC request failed. */
export class LiveError extends Schema.TaggedError<LiveError, { readonly brand: unique symbol }>()(
  "LiveError",
  { message: Schema.String },
) {}

// The RPC is rate limited (Namespace's proxy: 500 requests a minute per IP). Every HTTP request
// of the process waits its turn, 250 ms apart: at most 240 a minute. JSON-RPC batching and
// ensforge's multicalls put many reads in one request.
/* oxlint-disable effecttsgo/async-function, effecttsgo/global-date, effecttsgo/new-promise, effecttsgo/global-timers, effecttsgo/global-fetch -- viem's `fetchFn` is a Promise-returning callback outside any Effect runtime */
let nextRequestAt = 0;
const throttledFetch: typeof fetch = async (input, init) => {
  const now = Date.now();
  const at = Math.max(now, nextRequestAt);
  nextRequestAt = at + 250;
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
  return fetch(input, init);
};
/* oxlint-enable effecttsgo/async-function, effecttsgo/global-date, effecttsgo/new-promise, effecttsgo/global-timers, effecttsgo/global-fetch */

const makeClient = (network: Network, url: string, indexer?: Indexer) => {
  const chain = network === "mainnet" ? mainnet : sepolia;
  return Ensforge.create({
    chain,
    // L2s without an RPC set use their public RPC.
    transports: {
      ...Rec.map(l2Rpcs(), (l2Url) => http(l2Url, { retryCount: 5, retryDelay: 3_000 })),
      [chain.id]: http(url, {
        fetchFn: throttledFetch,
        batch: { batchSize: 50, wait: 20 },
        retryCount: 5,
        retryDelay: 3_000,
      }),
    },
    ...(indexer === undefined ? {} : { indexer }),
  }).extend(ensActions());
};

/** An ensforge client on a live network. */
export type LiveClient = ReturnType<typeof makeClient>;

/** Read-only ensforge clients on a live network, over its rate-limited RPC. */
export class Live extends Context.Service<
  Live,
  {
    readonly network: Network;
    /** Reads through the RPC only. */
    readonly reader: LiveClient;
    /** The same reads, with bigname as the client's indexer. */
    readonly withBigname: LiveClient;
    /** The same reads, with Goldsky as the client's indexer (mainnet only). */
    readonly withGoldsky: LiveClient | undefined;
    /** The network's latest block number. */
    readonly blockNumber: Effect.Effect<bigint, LiveError>;
    /** The word at `slot` of `address`, `0x0…0` when unset. */
    readonly storageAt: (address: Address, slot: Hex) => Effect.Effect<Hex, LiveError>;
    /** A viem read on any chain (the network's, or an L2 through its RPC). */
    readonly read: <A>(
      chainId: number,
      label: string,
      read: (client: Client) => Promise<A>,
    ) => Effect.Effect<A, LiveError>;
  }
  // Service keys are `<package>/<Service>`; this file is not named after the service.
  // oxlint-disable-next-line effecttsgo/deterministic-keys
>()("@ensforge/test-live/Live") {
  static readonly layer = (network: Network) =>
    Layer.effect(
      Live,
      Effect.gen(function* () {
        const { variable, url } = networkRpc(network);
        if (url === undefined) {
          return yield* LiveError.make({ message: `set ${variable} to read ${network}` });
        }

        const reader = makeClient(network, url);
        return Live.of({
          network,
          reader,
          withBigname: makeClient(network, url, bigname()),
          withGoldsky: network === "mainnet" ? makeClient(network, url, goldsky()) : undefined,
          blockNumber: Effect.tryPromise({
            try: () => getBlockNumber(reader.client()),
            catch: (cause) => LiveError.make({ message: `block number: ${String(cause)}` }),
          }),
          storageAt: (address, slot) =>
            Effect.tryPromise({
              try: () => getStorageAt(reader.client(), { address, slot }),
              catch: (cause) =>
                LiveError.make({ message: `storage of ${address}: ${String(cause)}` }),
            }).pipe(Effect.map((word): Hex => word ?? `0x${Str.repeat(64)("0")}`)),
          read: (chainId, label, read) =>
            Effect.tryPromise({
              try: () => read(reader.client(chainId)),
              catch: (cause) =>
                LiveError.make({ message: `${label} on chain ${chainId}: ${String(cause)}` }),
            }),
        });
      }),
    );
}

/** A live network for a test file. Live reads run on real time, without Effect's test services. */
export const onLive = (network: Network) =>
  layer(Live.layer(network), { excludeTestServices: true });
