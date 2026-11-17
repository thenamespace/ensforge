import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import { Deployments } from "@ensforge/contracts";
import { accounts, Anvil, Devnet, devnetClient, type DevnetInstance } from "@ensforge/test-devnet";
import { chainServices } from "@ensforge/test-integration/support/lane";
import { defineChain, type Address } from "viem";
import { mainnet, sepolia } from "viem/chains";

/** A live network a fork follows. */
export type Network = "mainnet" | "sepolia";

/**
 * Where each fork starts: after the ENSv2 cutover, at blocks whose state anvil caches on disk, so
 * later runs barely reach the RPC. Moving a pin refetches state and may change real names' facts.
 */
export const forkBlocks = { mainnet: 26_437_000n, sepolia: 12_157_000n } as const;

/** The fork could not start: no RPC URL, or anvil failed. */
export class ForkError extends Schema.TaggedError<ForkError, { readonly brand: unique symbol }>()(
  "ForkError",
  { message: Schema.String },
) {}

const envFile = fileURLToPath(new URL("../../../../.env", import.meta.url));

const startFork = Effect.fn("startFork")(function* (network: Network) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const variable = network === "mainnet" ? "ENSFORGE_MAINNET_RPC_URL" : "ENSFORGE_SEPOLIA_RPC_URL";
  const url = process.env[variable];
  if (url === undefined || url === "") {
    return yield* new ForkError({ message: `set ${variable} (an archive RPC) to fork ${network}` });
  }

  // The RPC is rate limited (Namespace's proxy: 500 requests a minute per IP). 80 compute units
  // a second keeps anvil near 5 requests a second, well under it.
  const anvil = yield* Anvil;
  const { rpcUrl } = yield* anvil.start({
    fork: { url, blockNumber: forkBlocks[network], computeUnitsPerSecond: 80 },
  });

  const deployments = network === "mainnet" ? Deployments.mainnet : Deployments.sepolia;
  const contracts: Record<string, Address> = Object.fromEntries([
    ...Object.entries(deployments.v1.contracts).map(([key, address]) => [`v1.${key}`, address]),
    ...Object.entries(deployments.v2.contracts).map(([key, address]) => [`v2.${key}`, address]),
  ]);
  const base = network === "mainnet" ? mainnet : sepolia;
  const chain = defineChain({
    ...base,
    rpcUrls: { default: { http: [rpcUrl] } },
    contracts: {
      ...base.contracts,
      ensUniversalResolver: { address: deployments.v2.contracts.universalResolver },
    },
  });

  return {
    profile: network,
    rpcUrl,
    chain,
    deployments,
    contracts,
    contract: (key) => {
      const address = contracts[key];
      if (address === undefined) throw new Error(`${network} has no ${key} in its deployment`);
      return address;
    },
    ledger: new Map(),
    seed: undefined,
    accounts,
    client: devnetClient(rpcUrl, chain),
  } satisfies DevnetInstance;
});

/**
 * A fork of `network` at its pinned block for a test file, with `Devnet` (the fork, shaped like
 * a devnet) and the chain services (`Chain`, `Clients`, `Wallets`, `Gateways`). Forks run on real
 * time, so the layer is built without Effect's test services.
 */
export const onFork = (network: Network) =>
  layer(
    chainServices.pipe(
      Layer.provideMerge(Layer.effect(Devnet, startFork(network))),
      Layer.provide(Anvil.layer),
      Layer.provide(NodeServices.layer),
    ),
    { excludeTestServices: true },
  );
