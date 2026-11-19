import { assert, describe } from "@effect/vitest";
import { Array as Arr, Effect, Exit, Record as Rec, String as Str } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { getAddress, namehash, parseAbi, type Address } from "viem";
import { getCode, readContract } from "viem/actions";

import { Live, onLive } from "../support/live.ts";

// The namespace table in @ensforge/contracts against the chains: addresses, parent resolvers and
// the links between contracts. A failure means a namespace moved and the table needs an update.

type Parent = Deployments.ParentNamespace<Readonly<Record<string, Address>>>;

// `[chainId, contract]` rows of a contract group, for the code check.
const listed = (chainId: number, prefix: string, contracts: Readonly<Record<string, Address>>) =>
  Arr.map(Rec.toEntries(contracts), ([name, address]) => ({
    chainId,
    label: `${prefix} ${name}`,
    address,
  }));

describe("L2 namespaces", () => {
  for (const network of ["mainnet", "sepolia"] as const) {
    onLive(network)(network, (it) => {
      const { basenames, linea, celonames, durin, namespace } = Deployments.namespaces;
      const key = network === "mainnet" ? "mainnet" : "testnet";
      const parents: readonly Parent[] =
        network === "mainnet"
          ? [basenames.mainnet, linea.mainnet, celonames.mainnet]
          : [basenames.testnet, linea.testnet];

      it.effect("every listed contract has code on its chain", () =>
        Effect.gen(function* () {
          const live = yield* Live;
          const { ensChainId } = durin[key];

          const contracts = [
            ...Arr.flatMap(parents, (parent) => [
              ...listed(ensChainId, parent.parent, { l1Resolver: parent.l1Resolver }),
              ...listed(parent.chainId, parent.parent, parent.contracts),
            ]),
            ...listed(ensChainId, "durin", { l1Resolver: durin[key].l1Resolver }),
            ...Arr.flatMap(durin[key].chainIds, (chainId) =>
              listed(chainId, "durin", {
                factory: durin[key].factory,
                registryImplementation: durin[key].registryImplementation,
              }),
            ),
            ...listed(ensChainId, "namespace hybrid resolver", namespace[key].hybridResolvers),
            ...Arr.flatMap(
              Rec.toEntries<string, Readonly<Record<string, Address>>>(namespace[key].chains),
              ([chainId, chainContracts]) => listed(Number(chainId), "namespace", chainContracts),
            ),
          ];

          const missing = yield* Effect.filter(
            contracts,
            ({ chainId, label, address }) =>
              live
                .read(chainId, label, (client) => getCode(client, { address }))
                .pipe(Effect.map((code) => code === undefined || code === "0x")),
            { concurrency: 8 },
          );
          assert.deepStrictEqual(missing, []);
        }),
      );

      it.effect("parent names use the listed resolver", () =>
        Effect.gen(function* () {
          const live = yield* Live;
          const { registry } = (network === "mainnet" ? Deployments.mainnet : Deployments.sepolia)
            .v1.contracts;

          for (const parent of parents) {
            const resolver = yield* live.read(parent.ensChainId, parent.parent, (client) =>
              readContract(client, {
                address: registry,
                abi: Abis.v1.ensRegistry,
                functionName: "resolver",
                args: [namehash(parent.parent)],
              }),
            );
            assert.strictEqual(getAddress(resolver), parent.l1Resolver, parent.parent);
          }
        }),
      );

      it.effect("L2 contracts belong to their parent and Durin's implementation", () =>
        Effect.gen(function* () {
          const live = yield* Live;
          const base = basenames[key];
          const lineaNames = linea[key];

          const baseNode = yield* live.read(base.chainId, "basenames baseNode", (client) =>
            readContract(client, {
              address: base.contracts.baseRegistrar,
              abi: Abis.basenames.baseRegistrar,
              functionName: "baseNode",
            }),
          );
          assert.strictEqual(baseNode, namehash(base.parent));

          const [lineaNode, lineaGrace] = yield* live.read(
            lineaNames.chainId,
            "linea baseRegistrar",
            (client) =>
              Promise.all([
                readContract(client, {
                  address: lineaNames.contracts.baseRegistrar,
                  abi: Abis.v1.baseRegistrar,
                  functionName: "baseNode",
                }),
                readContract(client, {
                  address: lineaNames.contracts.baseRegistrar,
                  abi: Abis.v1.baseRegistrar,
                  functionName: "GRACE_PERIOD",
                }),
              ]),
          );
          assert.strictEqual(lineaNode, namehash(lineaNames.parent));
          assert.strictEqual(lineaGrace, BigInt(lineaNames.gracePeriod));

          if (network === "mainnet") {
            const celoNode = yield* live.read(
              celonames.mainnet.chainId,
              "celonames rootNode",
              (client) =>
                readContract(client, {
                  address: celonames.mainnet.contracts.registry,
                  abi: Abis.celonames.registry,
                  functionName: "rootNode",
                }),
            );
            assert.strictEqual(celoNode, namehash(celonames.mainnet.parent));
          }

          for (const chainId of durin[key].chainIds) {
            const implementation = yield* live.read(chainId, "durin implementation", (client) =>
              readContract(client, {
                address: durin[key].factory,
                abi: parseAbi(["function registryImplementation() view returns (address)"]),
                functionName: "registryImplementation",
              }),
            );
            assert.strictEqual(implementation, durin[key].registryImplementation, `${chainId}`);
          }
        }),
      );
    });
  }

  onLive("mainnet")("Namespace and off-chain providers", (it) => {
    it.effect("Namespace addresses match the latest @thenamespace/addresses", () =>
      Effect.gen(function* () {
        const response = yield* HttpClient.get(
          "https://unpkg.com/@thenamespace/addresses/dist/addresses.js",
        );
        const body = yield* response.text;
        const source = Str.toLowerCase(body);
        const { mainnet, testnet } = Deployments.namespaces.namespace;

        for (const address of [
          ...Rec.values(mainnet.hybridResolvers),
          ...Rec.values(testnet.hybridResolvers),
          ...Arr.flatMap(Rec.values({ ...mainnet.chains, ...testnet.chains }), Rec.values),
        ]) {
          assert.include(source, Str.toLowerCase(address));
        }

        // A chain the package adds is a chain Namespace L2 names may now live on.
        const chainIds = Arr.map(
          Arr.fromIterable(Str.matchAll(/const \w+id = (\d+);/g)(source)),
          (match) => Number(match[1]),
        );
        assert.includeMembers([1, 11155111, 8453, 10, 84532], chainIds);
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the one HTTP request of this test
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    );

    // Names that only their owners can change: each family's gateway must still answer.
    it.effect("real names of every family resolve through their gateways", () =>
      Effect.gen(function* () {
        const { reader } = yield* Live;

        for (const name of [
          "jesse.base.eth",
          "bobbob.linea.eth",
          "samvai.celo.eth",
          "test.worldfair.eth",
          "thecap.gotbased.eth",
        ]) {
          const address = yield* Actions.record.getAddress(reader, { name });
          assert.isNotNull(address, name);
        }
      }),
    );

    // Ethereum's proof of Base's reverse registrar fails for every address (2026-11-20: ENS's
    // Base verifier reverts `InvalidGameTypeBitMask`), so a reader that reaches Base reads it
    // there. Only the address can change its name; a failure may mean it did.
    it.effect("a real Base primary name reads on Base", () =>
      Effect.gen(function* () {
        const { reader } = yield* Live;
        const name = yield* Actions.primaryName.get(reader, {
          address: "0x7c9bf46900c56fb094537cfce7ae3b326f16f71f",
          coin: { chainId: 8453 },
        });
        assert.strictEqual(name, "mrbagg.base.eth");
      }),
    );

    it.effect("active providers' gateways answer and unavailable ones still fail", () =>
      Effect.gen(function* () {
        const { reader } = yield* Live;

        for (const [provider, name] of [
          ["coinbase", "jesse.cb.id"],
          ["uniswap", "test.uni.eth"],
          ["world", "test.world.id"],
          ["gemini", "test.gemini.eth"],
          ["justaname", "test.justan.id"],
          ["namespace", "happy.offchainsub.eth"],
          ["clave", "getclave.clv.eth"],
          ["lens", "test.lens.xyz"],
          ["spaceId", "test.bnb.eth"],
          ["walletConnect", "test.wcn.id"],
        ] as const) {
          const exit = yield* Effect.exit(Actions.record.getAddress(reader, { name }));
          const { status } = Deployments.offchainProviders[provider];
          assert.strictEqual(Exit.isSuccess(exit), status === "active", `${provider} (${name})`);
        }
      }),
    );
  });
});
