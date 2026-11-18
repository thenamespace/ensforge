import { NodeServices } from "@effect/platform-node";
import { Array as Arr, Context, Effect, Layer, Record as Rec } from "effect";

import type { Deployments } from "@ensforge/contracts";
import { defineChain, type Address, type Chain } from "viem";
import { foundry } from "viem/chains";

import { Anvil } from "./anvil/Anvil.ts";
import { build, type Seed } from "./build.ts";
import { devnetClient, type DevnetClient } from "./client.ts";
import { accounts, type Ledger } from "./deploy/engine.ts";
import { profiles, type ProfileName } from "./profiles/profiles.ts";

export type DevnetOptions = {
  readonly profile: ProfileName;
  /** Extra state on top of the profile, e.g. test fixtures. */
  readonly seed?: Seed;
  /** Fixed port; a free one is picked when omitted. */
  readonly port?: number;
  /** `0.0.0.0` makes the chain reachable from containers (indexer, bundler). */
  readonly host?: string;
  /**
   * EIP-155 chain id, anvil's 31337 by default. Services that only index known chains (bigname)
   * need the devnet to answer as one of them, e.g. Sepolia's 11155111.
   */
  readonly chainId?: number;
};

/** A running devnet: anvil loaded with a built profile. */
export type DevnetInstance = {
  /** The built profile it runs, or the live network a fork follows. */
  readonly profile: ProfileName | "mainnet" | "sepolia";
  readonly rpcUrl: string;
  /** viem chain with Multicall3 and the Universal Resolver of the profile. */
  readonly chain: Chain;
  /** The ensforge deployment profile, for `Ensforge.create({ deployments })`. */
  readonly deployments: Deployments.Profile;
  /** Every deployed contract by ledger key (`v1.registry`, `v2.ethRegistry`, …). */
  readonly contracts: Readonly<Record<string, Address>>;
  /** The contract deployed under ledger key `key`; throws for a key the profile lacks. */
  readonly contract: (key: string) => Address;
  /** The same contracts with the artifact each was deployed from. */
  readonly ledger: Ledger;
  /** The seed's output, when started with one. */
  readonly seed: unknown;
  /** Prefunded named accounts (anvil's default mnemonic). */
  readonly accounts: typeof accounts;
  /** viem test, public and wallet actions on this devnet (`snapshot`, `increaseTime`, …). */
  readonly client: DevnetClient;
};

/**
 * Starts a devnet for `options.profile`, building and caching the profile first if needed. The
 * chain clock continues from the build's last block, so tests see the same times on every run.
 */
export const startDevnet = Effect.fn("startDevnet")(function* (options: DevnetOptions) {
  const built = yield* build(
    options.profile,
    options.seed === undefined ? {} : { seed: options.seed },
  );
  const anvil = yield* Anvil;
  const { rpcUrl } = yield* anvil.start({
    loadState: built.stateFile,
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.chainId === undefined ? {} : { chainId: options.chainId }),
  });

  const profileDeployments = profiles[options.profile].deployments(built.ledger);
  // The deployment and each protocol in it name the chain they live on.
  const deployments =
    options.chainId === undefined
      ? profileDeployments
      : {
          ...profileDeployments,
          chainId: options.chainId,
          ...(profileDeployments.v1 === undefined
            ? {}
            : { v1: { ...profileDeployments.v1, chainId: options.chainId } }),
          ...(profileDeployments.v2 === undefined
            ? {}
            : { v2: { ...profileDeployments.v2, chainId: options.chainId } }),
        };
  const contracts = Rec.fromEntries(
    Arr.map([...built.ledger], ([key, deployed]) => [key, deployed.address]),
  );
  const universalResolver =
    deployments.v2?.contracts.universalResolver ?? deployments.v1?.contracts.universalResolver;
  const chain = defineChain({
    ...foundry,
    ...(options.chainId === undefined ? {} : { id: options.chainId }),
    contracts: {
      // Every profile deploys the canonical Multicall3.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      multicall3: { address: contracts["canonical.multicall3"] as Address },
      ...(universalResolver === undefined
        ? {}
        : { ensUniversalResolver: { address: universalResolver } }),
    },
  });

  const instance: DevnetInstance = {
    profile: options.profile,
    rpcUrl,
    chain,
    deployments,
    contracts,
    contract: (key) => {
      const address = contracts[key];
      if (address === undefined) throw new Error(`${options.profile} deploys no ${key}`);
      return address;
    },
    ledger: built.ledger,
    seed: built.seed,
    accounts,
    client: devnetClient(rpcUrl, chain),
  };
  return instance;
});

/**
 * A devnet for tests. Chain tests run on real time, so build the layer without Effect's test
 * services: `layer(Devnet.layer({ profile }), { excludeTestServices: true })("…", (it) => …)`.
 */
export class Devnet extends Context.Service<Devnet, DevnetInstance>()(
  "@ensforge/test-devnet/Devnet",
) {
  static readonly layer = (options: DevnetOptions) =>
    Layer.effect(Devnet, startDevnet(options)).pipe(
      Layer.provide(Anvil.layer),
      Layer.provide(NodeServices.layer),
    );
}
