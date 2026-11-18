import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { Abis } from "@ensforge/contracts";
import { labelhash, namehash, size, zeroAddress, zeroHash, type Address } from "viem";

import { Chain, Devnet } from "../../src/index.ts";

// Creates `label.eth` on the 2017 registry, owned by `owner`, with `resolver`.
const oldEthName = Effect.fnUntraced(function* (label: string, owner: Address, resolver: Address) {
  const { accounts, contract } = yield* Devnet;
  const chain = yield* Chain;
  const old = { address: contract("v1.legacyRegistry"), abi: Abis.v1.ensRegistry } as const;

  const ethOwner = yield* chain.read({ ...old, functionName: "owner", args: [namehash("eth")] });
  if (ethOwner === zeroAddress) {
    yield* chain.write({
      ...old,
      functionName: "setSubnodeOwner",
      args: [zeroHash, labelhash("eth"), accounts.owner],
      account: accounts.owner,
    });
  }
  yield* chain.write({
    ...old,
    functionName: "setSubnodeOwner",
    args: [namehash("eth"), labelhash(label), owner],
    account: accounts.owner,
  });
  yield* chain.write({
    ...old,
    functionName: "setResolver",
    args: [namehash(`${label}.eth`), resolver],
    account: owner,
  });
});

describe("legacy ENSv1 generations", () => {
  layer(Chain.layer.pipe(Layer.provideMerge(Devnet.layer({ profile: "v1-live" }))), {
    excludeTestServices: true,
  })("v1-live", (it) => {
    it.effect("an old-registry name is visible through the fallback but not writable there", () =>
      Effect.gen(function* () {
        const { accounts, contract } = yield* Devnet;
        const chain = yield* Chain;
        const registry = { address: contract("v1.registry"), abi: Abis.v1.ensRegistry } as const;
        const node = namehash("relic.eth");

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* oldEthName("relic", accounts.user, contract("legacy.publicResolver2017"));

            const owner = yield* chain.read({ ...registry, functionName: "owner", args: [node] });
            assert.strictEqual(owner, accounts.user);
            const recordExists = yield* chain.read({
              ...registry,
              functionName: "recordExists",
              args: [node],
            });
            assert.isFalse(recordExists);
            const setResolver = chain.simulate({
              ...registry,
              functionName: "setResolver",
              args: [node, zeroAddress],
              account: accounts.user,
            });
            const resolverSet = yield* Effect.isSuccess(setResolver);
            assert.isFalse(resolverSet);
          }),
        );
      }),
    );

    it.effect(
      "the 2017 resolver authorizes writes against the old registry and lacks text records",
      () =>
        Effect.gen(function* () {
          const { accounts, contract } = yield* Devnet;
          const chain = yield* Chain;
          const frozen = { address: contract("legacy.publicResolver2017") } as const;
          const node = namehash("frozen.eth");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* oldEthName("frozen", accounts.user, frozen.address);

              for (const [account, authorized] of [
                [accounts.user, true],
                [accounts.user2, false],
              ] as const) {
                const setAddr = chain.simulate({
                  ...frozen,
                  abi: Abis.v1.publicResolver,
                  functionName: "setAddr",
                  args: [node, accounts.user2],
                  account,
                });
                const succeeded = yield* Effect.isSuccess(setAddr);
                assert.strictEqual(succeeded, authorized, account);
              }
              const text = yield* chain.read({
                ...frozen,
                abi: Abis.shared.erc165,
                functionName: "supportsInterface",
                args: ["0x59d1d43c"],
              });
              assert.isFalse(text);
            }),
          );
        }),
    );

    it.effect("the Feb 2020 resolver has multicall but does not advertise it", () =>
      Effect.gen(function* () {
        const { contract } = yield* Devnet;
        const chain = yield* Chain;

        const advertised = yield* chain.read({
          address: contract("legacy.publicResolver2020Feb"),
          abi: Abis.shared.erc165,
          functionName: "supportsInterface",
          args: ["0xac9650d8"],
        });
        assert.isFalse(advertised);
      }),
    );

    it.effect("old default reverse resolvers have no ERC-165", () =>
      Effect.gen(function* () {
        const { contract } = yield* Devnet;
        const chain = yield* Chain;

        for (const key of [
          "legacy.defaultReverseResolver2017",
          "legacy.defaultReverseResolver2020",
        ]) {
          const supportsInterface = chain.read({
            address: contract(key),
            abi: Abis.shared.erc165,
            functionName: "supportsInterface",
            args: ["0x01ffc9a7"],
          });
          const supported = yield* Effect.isSuccess(supportsInterface);
          assert.isFalse(supported, key);
        }
      }),
    );

    it.effect("the 2020 controller registers until the ENSv2 launch", () =>
      Effect.gen(function* () {
        const { contract } = yield* Devnet;
        const chain = yield* Chain;

        const isController = yield* chain.read({
          address: contract("v1.baseRegistrar"),
          abi: Abis.v1.baseRegistrar,
          functionName: "controllers",
          args: [contract("v1.legacyEthRegistrarController")],
        });
        assert.isTrue(isController);
      }),
    );

    it.effect("hostile mocks revert, burn gas and return a megabyte", () =>
      Effect.gen(function* () {
        const { contract } = yield* Devnet;
        const chain = yield* Chain;
        const data = "0x01ffc9a7";

        const reverted = chain.call({ to: contract("mock.hostile.revert"), data });
        const revertedSucceeded = yield* Effect.isSuccess(reverted);
        assert.isFalse(revertedSucceeded);
        const burned = chain.call({ to: contract("mock.hostile.burnGas"), data, gas: 1_000_000n });
        const burnedSucceeded = yield* Effect.isSuccess(burned);
        assert.isFalse(burnedSucceeded);
        const large = yield* chain.call({ to: contract("mock.hostile.returnLarge"), data });
        assert.strictEqual(size(large.data ?? "0x"), 1 << 20);
      }),
    );
  });

  layer(Chain.layer.pipe(Layer.provideMerge(Devnet.layer({ profile: "mainnet-shaped" }))), {
    excludeTestServices: true,
  })("mainnet-shaped", (it) => {
    it.effect("no ENSv1 controller registers after the launch", () =>
      Effect.gen(function* () {
        const { contract } = yield* Devnet;
        const chain = yield* Chain;

        for (const key of [
          "v1.legacyEthRegistrarController",
          "v1.ethRegistrarController",
          "v1.wrappedEthRegistrarController",
          "v1.nameWrapper",
        ]) {
          const isController = yield* chain.read({
            address: contract("v1.baseRegistrar"),
            abi: Abis.v1.baseRegistrar,
            functionName: "controllers",
            args: [contract(key)],
          });
          assert.isFalse(isController, key);
        }
      }),
    );
  });
});
