import { assert, describe, layer } from "@effect/vitest";
import { Effect, Fiber, Schedule } from "effect";

import { Ensforge, ensActions } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import {
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  parseAbi,
  zeroAddress,
} from "viem";
import { getEnsAddress } from "viem/actions";

import { Devnet, type DevnetInstance } from "../../src/index.ts";

const erc20 = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const clientsOf = (devnet: DevnetInstance) => {
  const transport = http(devnet.rpcUrl);
  const publicClient = createPublicClient({ chain: devnet.chain, transport });
  const walletClient = createWalletClient({
    chain: devnet.chain,
    transport,
    account: devnet.accounts.user,
  });
  const ens = Ensforge.create({
    publicClient,
    walletClient,
    deployment: devnet.deployments,
  }).extend(ensActions());
  return { publicClient, walletClient, ens };
};

// Registrations wait out the commitment age in chain time; advance it while they wait.
const advanceChainTime = (devnet: DevnetInstance) =>
  Effect.promise(async () => {
    await devnet.client.increaseTime({ seconds: 30 });
    await devnet.client.mine({ blocks: 1 });
  }).pipe(Effect.repeat(Schedule.spaced("100 millis")), Effect.forkChild);

// Chain tests run on real time: no TestClock.
const devnetLayer = (profile: DevnetInstance["profile"]) =>
  layer(Devnet.layer({ profile }), { excludeTestServices: true });

describe("devnet profiles", () => {
  devnetLayer("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("ensforge reads ENSv2 state from the generated profile", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { ens } = clientsOf(devnet);

        const eth = yield* Actions.name.get(ens, { name: "eth" });
        assert.strictEqual(eth.protocol, "v2");
        assert.strictEqual(eth.owner, devnet.accounts.nameOwner);
        assert.strictEqual(eth.subregistry, devnet.deployments.v2?.contracts.ethRegistry);

        const available = yield* Actions.registration.isAvailable(ens, {
          name: "devnet-smoke.eth",
        });
        assert.isTrue(available);
      }),
    );

    it.effect("a name registered through ensforge resolves through ENSv1's resolver", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { publicClient, walletClient, ens } = clientsOf(devnet);
        const usdc = devnet.deployments.v2?.paymentTokens?.usdc ?? zeroAddress;
        yield* Effect.promise(() =>
          walletClient.writeContract({
            address: usdc,
            abi: erc20,
            functionName: "mint",
            args: [devnet.accounts.user, 10n ** 12n],
          }),
        );
        yield* Effect.promise(() =>
          walletClient.writeContract({
            address: usdc,
            abi: erc20,
            functionName: "approve",
            args: [devnet.deployments.v2?.contracts.ethRegistrar ?? zeroAddress, maxUint256],
          }),
        );

        const clock = yield* advanceChainTime(devnet);
        yield* Actions.registration.registerSync(ens, {
          names: "resolved.eth",
          duration: 31_536_000n,
          paymentToken: "usdc",
          records: { addresses: { eth: devnet.accounts.user2 } },
        });
        yield* Fiber.interrupt(clock);

        // ENSv1's Universal Resolver goes through the `.eth` resolver, which is ENSv2Resolver.
        const resolved = yield* Effect.promise(() =>
          getEnsAddress(publicClient, {
            name: "resolved.eth",
            universalResolverAddress: devnet.contracts["v1.universalResolver"],
          }),
        );
        assert.strictEqual(resolved, devnet.accounts.user2);
        const viaProfile = yield* Actions.record.getAddress(ens, { name: "resolved.eth" });
        assert.strictEqual(viaProfile, devnet.accounts.user2);
      }),
    );
  });

  devnetLayer("v1-live")("v1-live", (it) => {
    it.effect("ensforge reads ENSv1 state, and ENSv1 still owns .eth", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { ens } = clientsOf(devnet);

        const eth = yield* Actions.name.get(ens, { name: "eth" });
        assert.strictEqual(eth.protocol, "v1");
        assert.strictEqual(eth.owner, devnet.contracts["v1.baseRegistrar"]);
      }),
    );
  });

  devnetLayer("sepolia-shaped")("sepolia-shaped", (it) => {
    it.effect("ensforge reads ENSv2 with Sepolia's capabilities", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { ens } = clientsOf(devnet);

        assert.isFalse(devnet.deployments.v2?.capabilities.resolutionErrorWrapping);
        const eth = yield* Actions.name.get(ens, { name: "eth" });
        assert.strictEqual(eth.protocol, "v2");
        const available = yield* Actions.registration.isAvailable(ens, {
          name: "sepolia-smoke.eth",
        });
        assert.isTrue(available);
      }),
    );
  });

  devnetLayer("v2-only")("v2-only", (it) => {
    it.effect("the generated profile has no ENSv1", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { ens } = clientsOf(devnet);

        assert.isUndefined(devnet.deployments.v1);
        const eth = yield* Actions.name.get(ens, { name: "eth" });
        assert.strictEqual(eth.protocol, "v2");
      }),
    );
  });
});
