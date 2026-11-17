import { NodeServices } from "@effect/platform-node";
import { Context, Effect, Layer } from "effect";

import type { Deployments } from "@ensforge/contracts";
import { defineChain, type Address, type Chain } from "viem";
import { foundry } from "viem/chains";

import { Anvil } from "./anvil/Anvil.ts";
import { build } from "./build.ts";
import { devnetClient, type DevnetClient } from "./client.ts";
import { accounts, type Ledger } from "./deploy/engine.ts";
import { profiles, type ProfileName } from "./profiles/profiles.ts";

export type DevnetOptions = {
  readonly profile: ProfileName;
  /** Fixed port; a free one is picked when omitted. */
  readonly port?: number;
  /** `0.0.0.0` makes the chain reachable from containers (indexer, bundler). */
  readonly host?: string;
};

/** A running devnet: anvil loaded with a built profile. */
export type DevnetInstance = {
  readonly profile: ProfileName;
  readonly rpcUrl: string;
  /** viem chain with Multicall3 and the Universal Resolver of the profile. */
  readonly chain: Chain;
  /** The ensforge deployment profile, for `Ensforge.create({ deployments })`. */
  readonly deployments: Deployments.Profile;
  /** Every deployed contract by ledger key (`v1.registry`, `v2.ethRegistry`, …). */
  readonly contracts: Readonly<Record<string, Address>>;
  /** The same contracts with the artifact each was deployed from. */
  readonly ledger: Ledger;
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
  const built = yield* build(options.profile);
  const anvil = yield* Anvil;
  const { rpcUrl } = yield* anvil.start({
    loadState: built.stateFile,
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.host === undefined ? {} : { host: options.host }),
  });

  const deployments = profiles[options.profile].deployments(built.ledger);
  const contracts = Object.fromEntries(
    [...built.ledger].map(([key, deployed]) => [key, deployed.address]),
  );
  const universalResolver =
    deployments.v2?.contracts.universalResolver ?? deployments.v1?.contracts.universalResolver;
  const chain = defineChain({
    ...foundry,
    contracts: {
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
    ledger: built.ledger,
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
