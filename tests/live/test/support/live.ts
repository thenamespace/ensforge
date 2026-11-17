import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { layer } from "@effect/vitest";
import { Context, Effect, Layer, Schema } from "effect";

import { Ensforge, ensActions } from "@ensforge/sdk";
import { bigname, goldsky, type Indexer } from "@ensforge/sdk/indexer";
import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

/** A live network the read-only suites check. */
export type Network = "mainnet" | "sepolia";

/** The live suites cannot run: no RPC URL. */
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

        return Live.of({
          network,
          reader: makeClient(network, url),
          withBigname: makeClient(network, url, bigname()),
          withGoldsky: network === "mainnet" ? makeClient(network, url, goldsky()) : undefined,
        });
      }),
    );
}

/** A live network for a test file. Live reads run on real time, without Effect's test services. */
export const onLive = (network: Network) =>
  layer(Live.layer(network), { excludeTestServices: true });
