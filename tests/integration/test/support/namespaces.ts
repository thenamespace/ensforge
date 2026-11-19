import { NodeServices } from "@effect/platform-node";
import { Context, Effect, Layer, Record as Rec } from "effect";

import { Deployments } from "@ensforge/contracts";
import type { Ensforge } from "@ensforge/sdk";
import {
  Anvil,
  Chain,
  ChainError,
  Devnet,
  gatewaySigner,
  namespacesOf,
  startL2,
  type L2Instance,
  type L2ProfileName,
} from "@ensforge/test-devnet";
import {
  factAddress,
  fixtureSeed,
  fixturesApi,
  sourcesKey,
  type FixturesApi,
  type Manifest,
} from "@ensforge/test-fixtures";
import { createWalletClient, http, namehash, parseAbi, type Address, type Transport } from "viem";

import type { ClientOptions } from "./clients.ts";
import { Gateways, type Lookup } from "./gateways.ts";
import { l2Answers, offchainAnswer, signed } from "./namespace-gateways.ts";

/**
 * The gateways the L2 namespaces' Ethereum resolvers ask: one per family, and one per Namespace
 * resolution type (Base, OP Mainnet, its off-chain database).
 */
export type GatewayRoute =
  | "basenames"
  | "linea"
  | "celonames"
  | "durin"
  | "namespace.base"
  | "namespace.optimism"
  | "namespace.offchain";

/** The address every Namespace off-chain name resolves to. */
export const offchainAddress: Address = "0x0000000000000000000000000000000000C0FFEE";

const setUrlAbi = parseAbi([
  "function setUrl(string url)",
  "function setURL(string url)",
  "function setOffchainGatewayUrls(string[] urls)",
  "function setResolutionUrls(uint256 resolutionType, string[] urls)",
  "function updateRoute(uint256 id, string url, address signer)",
  "function setL2Registry(bytes32 node, uint64 targetChainId, address targetRegistryAddress)",
]);

/** The fixtures seeded on `l2`: its seed is `fixtureSeed`'s output, a `Manifest`. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const fixturesOn = (l2: L2Instance) => fixturesApi(l2.seed as Manifest);

/** An RPC request to an L2, failing with `ChainError`. */
const onL2 = <A>(method: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => ChainError.make({ method, cause }) });

/**
 * The L2 namespaces next to a `mainnet-shaped` (or `v2-only`) devnet seeded with fixtures: an
 * anvil per L2 with its fixture names, a gateway per family answering from the L2 and signing as
 * the families' resolvers expect, and those resolvers pointed at the gateways. Clients built with
 * `clientOptions` reach every L2 and know the namespaces (`deployment.namespaces`).
 */
export class Namespaces extends Context.Service<
  Namespaces,
  {
    readonly l2s: { readonly [profile in L2ProfileName]: L2Instance };
    /** Fixtures seeded on each L2, selected like the devnet's. */
    readonly fixtures: { readonly [profile in L2ProfileName]: FixturesApi };
    /** The devnet's deployment profile with its L2 namespaces. */
    readonly deployment: Deployments.Profile;
    /** Client options for every L2, with `account`'s wallet on each when given. */
    readonly clientOptions: (
      account?: Address,
    ) => Pick<ClientOptions, "transports" | "wallets" | "deployment">;
    /** The gateway URL `route` is served at. */
    readonly gatewayUrl: (route: GatewayRoute) => string;
    /** Points `route`'s resolvers at `url` instead (use inside `isolated` to undo it). */
    readonly pointAt: (route: GatewayRoute, url: string) => Effect.Effect<void, ChainError>;
    /** Runs `effect` and then restores the devnet and every L2. */
    readonly isolated: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | ChainError, R>;
    /** Moves every chain's clock forward by `seconds` and mines a block on each. */
    readonly passTime: (seconds: number) => Effect.Effect<void, ChainError>;
  }
  // Service keys are `<package>/<Service>`; this file is not named after the service.
  // oxlint-disable-next-line effecttsgo/deterministic-keys
>()("@ensforge/test-integration/Namespaces") {
  static readonly layer = Layer.effect(
    Namespaces,
    Effect.gen(function* () {
      const devnet = yield* Devnet;
      const chain = yield* Chain;
      const gateways = yield* Gateways;
      const { deployer, alice } = devnet.accounts;

      const key = yield* sourcesKey();
      const start = (profile: L2ProfileName) =>
        startL2({ profile, seed: fixtureSeed(profile, key) });
      const l2s = yield* Effect.all(
        {
          "l2-base": start("l2-base"),
          "l2-optimism": start("l2-optimism"),
          "l2-linea": start("l2-linea"),
          "l2-celo": start("l2-celo"),
        },
        { concurrency: "unbounded" },
      );
      const chains = [l2s["l2-base"], l2s["l2-optimism"], l2s["l2-linea"], l2s["l2-celo"]];
      const fixtures = {
        "l2-base": fixturesOn(l2s["l2-base"]),
        "l2-optimism": fixturesOn(l2s["l2-optimism"]),
        "l2-linea": fixturesOn(l2s["l2-linea"]),
        "l2-celo": fixturesOn(l2s["l2-celo"]),
      };

      // Every chain continues from the latest of their clocks, so expiries read alike everywhere.
      const now = yield* chain.now;
      for (const l2 of chains) {
        const block = yield* onL2("eth_getBlockByNumber", () => l2.client.getBlock());
        if (block.timestamp >= now) continue;
        yield* onL2("evm_setNextBlockTimestamp", () =>
          l2.client.setNextBlockTimestamp({ timestamp: now }),
        );
        yield* onL2("evm_mine", () => l2.client.mine({ blocks: 1 }));
      }

      const answer = (respond: (lookup: Lookup) => Effect.Effect<`0x${string}`, ChainError>) =>
        gateways.serveLookups((lookup: Lookup) =>
          Effect.gen(function* () {
            const result = yield* respond(lookup);
            return yield* signed(lookup, result, (yield* chain.now) + 3600n);
          }),
        );
      const served = {
        basenames: yield* answer(l2Answers.registry(l2s["l2-base"], "basenames.registry")),
        // Linea's stand-in resolver returns the gateway's answer as it is.
        linea: yield* gateways.serveLookups(l2Answers.registry(l2s["l2-linea"], "linea.registry")),
        celonames: yield* answer(l2Answers.celonames(l2s["l2-celo"])),
        durin: yield* answer(l2Answers.durin(l2s["l2-base"])),
        "namespace.base": yield* answer(l2Answers.namespace(l2s["l2-base"])),
        "namespace.optimism": yield* answer(l2Answers.namespace(l2s["l2-optimism"])),
        "namespace.offchain": yield* answer(offchainAnswer(offchainAddress)),
      } satisfies Record<GatewayRoute, { readonly url: string }>;
      // Without `{data}` in the URL, clients POST the lookup, as the in-process gateways expect.
      const gatewayUrl = (route: GatewayRoute) => served[route].url;

      const write = (address: Address, functionName: string, args: readonly unknown[]) =>
        chain.write({ account: deployer, address, abi: setUrlAbi, functionName, args });
      const namespaceRoutes = {
        "namespace.base": [8453n, 2n],
        "namespace.optimism": [10n, 3n],
        "namespace.offchain": [9999n, 1n],
      } as const;
      const pointAt = (route: GatewayRoute, url: string) =>
        Effect.gen(function* () {
          switch (route) {
            case "basenames":
            case "linea":
              return yield* write(devnet.contract(`namespaces.${route}.l1Resolver`), "setUrl", [
                url,
              ]);
            case "celonames":
              return yield* write(
                devnet.contract("namespaces.celonames.l1Resolver"),
                "setOffchainGatewayUrls",
                [[url]],
              );
            case "durin":
              return yield* write(devnet.contract("namespaces.durin.l1Resolver"), "setURL", [url]);
            default: {
              const [resolutionType, routeId] = namespaceRoutes[route];
              for (const hybrid of ["current", "previous"]) {
                yield* write(
                  devnet.contract(`namespaces.namespace.hybridResolver.${hybrid}`),
                  "setResolutionUrls",
                  [resolutionType, [url]],
                );
              }
              return yield* write(
                devnet.contract("namespaces.namespace.hybridResolver.v2"),
                "updateRoute",
                [routeId, url, gatewaySigner.address],
              );
            }
          }
        }).pipe(Effect.asVoid);

      for (const route of Rec.keys(served)) yield* pointAt(route, gatewayUrl(route));
      // Durin's parent points at its registry on Base, as its owner does on durin.dev.
      yield* chain.write({
        account: alice,
        address: devnet.contract("namespaces.durin.l1Resolver"),
        abi: setUrlAbi,
        functionName: "setL2Registry",
        args: [
          namehash("durin-names.eth"),
          BigInt(l2s["l2-base"].chainId),
          factAddress(fixtures["l2-base"].byId("namespaces.durin.active").facts, "registry"),
        ],
      });

      const deployment = Deployments.define({
        ...devnet.deployments,
        namespaces: namespacesOf(devnet, l2s),
      });
      const transports: Record<number, Transport> = {};
      for (const l2 of chains) transports[l2.chainId] = http(l2.rpcUrl);
      const clientOptions = (account?: Address) => {
        const wallets: Record<number, Ensforge.ViemClientLike> = {};
        for (const l2 of chains) {
          if (account === undefined) continue;
          wallets[l2.chainId] = createWalletClient({
            chain: l2.chain,
            account,
            pollingInterval: 50,
            transport: http(l2.rpcUrl),
          });
        }
        return { transports, deployment, wallets };
      };

      const isolated = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.acquireUseRelease(
          Effect.forEach(chains, (l2) => onL2("evm_snapshot", () => l2.client.snapshot()), {
            concurrency: "unbounded",
          }),
          () => chain.isolated(effect),
          (ids) =>
            Effect.orDie(
              Effect.forEach(
                chains,
                (l2, index) =>
                  onL2("evm_revert", () => l2.client.revert({ id: ids[index] ?? "0x0" })),
                { concurrency: "unbounded" },
              ),
            ),
        );
      const passTime = (seconds: number) =>
        Effect.gen(function* () {
          yield* chain.increaseTime(seconds);
          yield* chain.mine();
          for (const l2 of chains) {
            yield* onL2("evm_increaseTime", () => l2.client.increaseTime({ seconds }));
            yield* onL2("evm_mine", () => l2.client.mine({ blocks: 1 }));
          }
        });

      return Namespaces.of({
        l2s,
        fixtures,
        deployment,
        clientOptions,
        gatewayUrl,
        pointAt,
        isolated,
        passTime,
      });
    }),
  ).pipe(Layer.provide(Anvil.layer), Layer.provide(NodeServices.layer));
}
