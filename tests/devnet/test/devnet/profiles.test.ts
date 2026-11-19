import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { Abis } from "@ensforge/contracts";
import { Duration, Ensforge, ensActions } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import {
  createWalletClient,
  decodeFunctionResult,
  encodeFunctionData,
  http,
  maxUint256,
  namehash,
  parseAbi,
  type Address,
} from "viem";

import { Chain, Devnet, dnsEncode, type DevnetInstance } from "../../src/index.ts";

/** An ensforge client on `devnet`, signing as `account` when given. */
const ensforgeOn = (devnet: DevnetInstance, account?: Address) => {
  const transport = http(devnet.rpcUrl);
  return Ensforge.create({
    chain: devnet.chain,
    transports: { [devnet.chain.id]: transport },
    publicRpc: false,
    ...(account === undefined
      ? {}
      : { wallet: createWalletClient({ chain: devnet.chain, transport, account }) }),
    deployment: devnet.deployments,
  }).extend(ensActions());
};

describe("devnet profiles", () => {
  layer(Chain.layer.pipe(Layer.provideMerge(Devnet.layer({ profile: "mainnet-shaped" }))), {
    excludeTestServices: true,
  })("mainnet-shaped", (it) => {
    it.effect("ensforge reads ENSv2 state from the generated profile", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const ens = ensforgeOn(devnet);

        const eth = yield* Actions.name.get(ens, { name: "eth" });
        assert.strictEqual(eth.protocol, "v2");
        assert.strictEqual(eth.owner, devnet.accounts.nameOwner);
        assert.strictEqual(eth.subregistry, devnet.contract("v2.ethRegistry"));
        const available = yield* Actions.registration.isAvailable(ens, {
          name: "devnet-smoke.eth",
        });
        assert.isTrue(available);
      }),
    );

    it.effect("a name registered through ensforge resolves through ENSv1's resolver", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const { user, user2 } = devnet.accounts;
        const usdc = devnet.contract("v2.usdc");
        const name = "resolved.eth";

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* chain.write({
              address: usdc,
              abi: parseAbi(["function mint(address to, uint256 amount)"]),
              functionName: "mint",
              args: [user, 10n ** 12n],
              account: user,
            });
            yield* chain.write({
              address: usdc,
              abi: Abis.shared.erc20,
              functionName: "approve",
              args: [devnet.contract("v2.ethRegistrar"), maxUint256],
              account: user,
            });
            const ens = ensforgeOn(devnet, user);
            yield* Actions.registration.registerSync(ens, {
              names: name,
              duration: Duration.years(1),
              paymentToken: "usdc",
              records: { addresses: { eth: user2 } },
              onStep: chain.passWaits,
            });

            // ENSv1's Universal Resolver goes through the `.eth` resolver, which is ENSv2Resolver.
            const [answer] = yield* chain.read({
              address: devnet.contract("v1.universalResolver"),
              abi: Abis.v1.universalResolver,
              functionName: "resolve",
              args: [
                dnsEncode(name),
                encodeFunctionData({
                  abi: Abis.shared.addrResolver,
                  functionName: "addr",
                  args: [namehash(name)],
                }),
              ],
            });
            const resolved = decodeFunctionResult({
              abi: Abis.shared.addrResolver,
              functionName: "addr",
              data: answer,
            });
            assert.strictEqual(resolved, user2);
            const address = yield* Actions.record.getAddress(ens, { name });
            assert.strictEqual(address, user2);
          }),
        );
      }),
    );
  });

  layer(Devnet.layer({ profile: "v1-live" }), { excludeTestServices: true })("v1-live", (it) => {
    it.effect("ensforge reads ENSv1 state, and ENSv1 still owns .eth", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;

        const eth = yield* Actions.name.get(ensforgeOn(devnet), { name: "eth" });
        assert.strictEqual(eth.protocol, "v1");
        assert.strictEqual(eth.owner, devnet.contract("v1.baseRegistrar"));
      }),
    );
  });

  layer(Devnet.layer({ profile: "sepolia-shaped" }), { excludeTestServices: true })(
    "sepolia-shaped",
    (it) => {
      it.effect("ensforge reads ENSv2 with Sepolia's capabilities", () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const ens = ensforgeOn(devnet);

          assert.isFalse(devnet.deployments.v2?.capabilities.resolutionErrorWrapping);
          const eth = yield* Actions.name.get(ens, { name: "eth" });
          assert.strictEqual(eth.protocol, "v2");
          const available = yield* Actions.registration.isAvailable(ens, {
            name: "sepolia-smoke.eth",
          });
          assert.isTrue(available);
        }),
      );
    },
  );

  layer(Devnet.layer({ profile: "v2-only" }), { excludeTestServices: true })("v2-only", (it) => {
    it.effect("the generated profile has no ENSv1", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;

        assert.isUndefined(devnet.deployments.v1);
        const eth = yield* Actions.name.get(ensforgeOn(devnet), { name: "eth" });
        assert.strictEqual(eth.protocol, "v2");
      }),
    );
  });
});
