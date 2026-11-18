import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { layer } from "@effect/vitest";
import { Context, Effect, Layer, Schema } from "effect";

import { Ensforge, ensActions } from "@ensforge/sdk";
import { bigname, goldsky, type Indexer } from "@ensforge/sdk/indexer";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { getBlockNumber, getStorageAt } from "viem/actions";
import { mainnet, sepolia } from "viem/chains";

/** A live network the read-only suites check. */
export type Network = "mainnet" | "sepolia";

/** The live suites cannot run (no RPC URL), or an RPC request failed. */
export class LiveError extends Schema.TaggedError<LiveError, { readonly brand: unique symbol }>()(
  "LiveError",
  { message: Schema.String },
) {}

const envFile = fileURLToPath(new URL("../../../../.env", import.meta.url));

// The RPC is rate limited (Namespace's proxy: 500 requests a minute per IP). Every HTTP request
// of the process waits its turn, 250 ms apart: at most 240 a minute. JSON-RPC batching and
// ensforge's multicalls put many reads in one request.
let nextRequestAt = 0;
const throttledFetch: typeof fetch = async (input, init) => {
  const now = Date.now();
  const at = Math.max(now, nextRequestAt);
  nextRequestAt = at + 250;
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
  return fetch(input, init);
};

const makeClient = (network: Network, url: string, indexer?: Indexer) =>
  Ensforge.create({
    publicClient: createPublicClient({
      chain: network === "mainnet" ? mainnet : sepolia,
      transport: http(url, {
        fetchFn: throttledFetch,
        batch: { batchSize: 50, wait: 20 },
        retryCount: 5,
        retryDelay: 3_000,
      }),
    }),
    ...(indexer === undefined ? {} : { indexer }),
  }).extend(ensActions());

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
  }
>()("@ensforge/test-live/Live") {
  static readonly layer = (network: Network) =>
    Layer.effect(
      Live,
      Effect.gen(function* () {
        if (existsSync(envFile)) process.loadEnvFile(envFile);
        const variable =
          network === "mainnet" ? "ENSFORGE_MAINNET_RPC_URL" : "ENSFORGE_SEPOLIA_RPC_URL";
        const url = process.env[variable];
        if (url === undefined || url === "") {
          return yield* new LiveError({ message: `set ${variable} to read ${network}` });
        }

        const reader = makeClient(network, url);
        return Live.of({
          network,
          reader,
          withBigname: makeClient(network, url, bigname()),
          withGoldsky: network === "mainnet" ? makeClient(network, url, goldsky()) : undefined,
          blockNumber: Effect.tryPromise({
            try: () => getBlockNumber(reader.publicClient),
            catch: (cause) => new LiveError({ message: `block number: ${String(cause)}` }),
          }),
          storageAt: (address, slot) =>
            Effect.tryPromise({
              try: async () =>
                (await getStorageAt(reader.publicClient, { address, slot })) ??
                `0x${"0".repeat(64)}`,
              catch: (cause) =>
                new LiveError({ message: `storage of ${address}: ${String(cause)}` }),
            }),
        });
      }),
    );
}

/** A live network for a test file. Live reads run on real time, without Effect's test services. */
export const onLive = (network: Network) =>
  layer(Live.layer(network), { excludeTestServices: true });
