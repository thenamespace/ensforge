import { NodeServices } from "@effect/platform-node";
import { layer } from "@effect/vitest";
import { Array as Arr, Effect, Layer, Record as Rec, Schema } from "effect";

import { Deployments } from "@ensforge/contracts";
import {
  accounts,
  Anvil,
  Chain,
  Devnet,
  devnetClient,
  type DevnetInstance,
} from "@ensforge/test-devnet";
import { networkRpc, type Network } from "@ensforge/test-harness/networks";
import { chainServices } from "@ensforge/test-integration/support/lane";
import { defineChain, encodeAbiParameters, erc20Abi, keccak256, toHex, type Address } from "viem";
import { mainnet, sepolia } from "viem/chains";

/**
 * Where each fork starts: after the ENSv2 cutover, at blocks whose state anvil caches on disk, so
 * later runs barely reach the RPC. Moving a pin refetches state and may change real names' facts.
 */
export const forkBlocks = { mainnet: 26_441_000n, sepolia: 12_157_000n } as const;

/** The fork could not start: no RPC URL, or anvil failed. */
export class ForkError extends Schema.TaggedError<ForkError, { readonly brand: unique symbol }>()(
  "ForkError",
  { message: Schema.String },
) {}

const startFork = Effect.fn("startFork")(function* (network: Network) {
  const { variable, url } = networkRpc(network);
  if (url === undefined) {
    return yield* ForkError.make({
      message: `set ${variable} (an archive RPC) to fork ${network}`,
    });
  }

  // The RPC is rate limited (Namespace's proxy: 500 requests a minute per IP). 80 compute units
  // a second keeps anvil near 5 requests a second, well under it.
  const anvil = yield* Anvil;
  const { rpcUrl } = yield* anvil.start({
    fork: { url, blockNumber: forkBlocks[network], computeUnitsPerSecond: 80 },
  });

  const deployments = network === "mainnet" ? Deployments.mainnet : Deployments.sepolia;
  const v1Contracts: Record<string, Address> = deployments.v1.contracts;
  const contracts: Record<string, Address> = {
    ...Rec.mapKeys(v1Contracts, (key) => `v1.${key}`),
    ...Rec.mapKeys(deployments.v2.contracts, (key) => `v2.${key}`),
    // Named as on the devnet, so the integration helpers (`usdcOf`) read the real token.
    ...Rec.mapKeys(deployments.v2.paymentTokens, (key) => `v2.${key}`),
  };
  const base = network === "mainnet" ? mainnet : sepolia;
  const chain = defineChain({
    ...base,
    rpcUrls: { default: { http: [rpcUrl] } },
    contracts: {
      ...base.contracts,
      ensUniversalResolver: { address: deployments.v2.contracts.universalResolver },
    },
  });

  // Anvil's well-known accounts carry code on real networks (EIP-7702 delegations to sweepers),
  // so they would reject token callbacks: clear it, so they behave as on a devnet.
  const client = devnetClient(rpcUrl, chain);
  yield* Effect.tryPromise({
    try: () =>
      Promise.all(
        Arr.map(Rec.values(accounts), (address) => client.setCode({ address, bytecode: "0x" })),
      ),
    catch: (cause) => ForkError.make({ message: `could not clear account code: ${String(cause)}` }),
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
    client,
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

/**
 * Gives `account` a balance of `amount` of the ERC-20 `token` on a fork, by writing the token's
 * balance mapping. The mapping's slot differs per token (USDC 9, DAI 2), so it is found by trying
 * each low slot until `balanceOf` reads the written value.
 */
export const fundToken = Effect.fnUntraced(function* (
  token: Address,
  account: Address,
  amount: bigint,
) {
  const chain = yield* Chain;
  const value = toHex(amount, { size: 32 });

  for (let slot = 0n; slot < 64n; slot++) {
    const key = keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [account, slot]),
    );
    const read = chain.read({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
    const before = yield* read;
    yield* chain.setStorage(token, key, value);
    const written = yield* read;
    if (written === amount) return yield* Effect.void;
    yield* chain.setStorage(token, key, toHex(before, { size: 32 }));
  }
  return yield* ForkError.make({ message: `no balance slot found for ${token}` });
});
