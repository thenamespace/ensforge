import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";

import { labelhash, namehash, parseAbi, zeroAddress, zeroHash, type Address } from "viem";

import { Devnet, type DevnetInstance } from "../../src/index.ts";

const registry = parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function recordExists(bytes32 node) view returns (bool)",
  "function setSubnodeOwner(bytes32 node, bytes32 label, address owner)",
  "function setResolver(bytes32 node, address resolver)",
]);
const resolver = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function setAddr(bytes32 node, address addr)",
  "function addr(bytes32 node) view returns (address)",
]);
const controllers = parseAbi(["function controllers(address) view returns (bool)"]);

const succeeds = (promise: () => Promise<unknown>) =>
  Effect.promise(() =>
    promise().then(
      () => true,
      () => false,
    ),
  );

// Creates `label.eth` on the old registry, owned by `owner`, with `resolverAddress`.
const oldEthName = (
  devnet: DevnetInstance,
  label: string,
  owner: Address,
  resolverAddress: Address,
) =>
  Effect.promise(async () => {
    const { client, contracts, accounts } = devnet;
    const old = contracts["v1.legacyRegistry"] as Address;
    const write = (
      functionName: "setSubnodeOwner" | "setResolver",
      args: readonly unknown[],
      account: Address,
    ) =>
      client
        .writeContract({
          address: old,
          abi: registry,
          functionName,
          args: args as never,
          account,
          chain: null,
        })
        .then((hash) => client.waitForTransactionReceipt({ hash }));
    if (
      (await client.readContract({
        address: old,
        abi: registry,
        functionName: "owner",
        args: [namehash("eth")],
      })) === zeroAddress
    ) {
      await write("setSubnodeOwner", [zeroHash, labelhash("eth"), accounts.owner], accounts.owner);
    }
    await write("setSubnodeOwner", [namehash("eth"), labelhash(label), owner], accounts.owner);
    await write("setResolver", [namehash(`${label}.eth`), resolverAddress], owner);
  });

const chainLayer = (profile: DevnetInstance["profile"]) =>
  layer(Devnet.layer({ profile }), { excludeTestServices: true });

describe("legacy ENSv1 generations", () => {
  chainLayer("v1-live")("v1-live", (it) => {
    it.effect("an old-registry name is visible through the fallback but not writable there", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { client, contracts, accounts } = devnet;
        const frozen = contracts["legacy.publicResolver2017"] as Address;
        yield* oldEthName(devnet, "relic", accounts.user, frozen);
        const node = namehash("relic.eth");

        const current = contracts["v1.registry"] as Address;
        const owner = yield* Effect.promise(() =>
          client.readContract({
            address: current,
            abi: registry,
            functionName: "owner",
            args: [node],
          }),
        );
        assert.strictEqual(owner, accounts.user);
        const exists = yield* Effect.promise(() =>
          client.readContract({
            address: current,
            abi: registry,
            functionName: "recordExists",
            args: [node],
          }),
        );
        assert.isFalse(exists);
        const canSetResolver = yield* succeeds(() =>
          client.simulateContract({
            address: current,
            abi: registry,
            functionName: "setResolver",
            args: [node, zeroAddress],
            account: accounts.user,
          }),
        );
        assert.isFalse(canSetResolver);
      }),
    );

    it.effect(
      "the 2017 resolver authorizes writes against the old registry and lacks text records",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const { client, contracts, accounts } = devnet;
          const frozen = contracts["legacy.publicResolver2017"] as Address;
          yield* oldEthName(devnet, "frozen", accounts.user, frozen);
          const node = namehash("frozen.eth");

          assert.isTrue(
            yield* succeeds(() =>
              client.simulateContract({
                address: frozen,
                abi: resolver,
                functionName: "setAddr",
                args: [node, accounts.user2],
                account: accounts.user,
              }),
            ),
          );
          assert.isFalse(
            yield* succeeds(() =>
              client.simulateContract({
                address: frozen,
                abi: resolver,
                functionName: "setAddr",
                args: [node, accounts.user2],
                account: accounts.user2,
              }),
            ),
          );
          const text = yield* Effect.promise(() =>
            client.readContract({
              address: frozen,
              abi: resolver,
              functionName: "supportsInterface",
              args: ["0x59d1d43c"],
            }),
          );
          assert.isFalse(text);
        }),
    );

    it.effect("the Feb 2020 resolver has multicall but does not advertise it", () =>
      Effect.gen(function* () {
        const { client, contracts } = yield* Devnet;
        const advertised = yield* Effect.promise(() =>
          client.readContract({
            address: contracts["legacy.publicResolver2020Feb"] as Address,
            abi: resolver,
            functionName: "supportsInterface",
            args: ["0xac9650d8"],
          }),
        );
        assert.isFalse(advertised);
      }),
    );

    it.effect("old default reverse resolvers have no ERC-165", () =>
      Effect.gen(function* () {
        const { client, contracts } = yield* Devnet;
        for (const key of [
          "legacy.defaultReverseResolver2017",
          "legacy.defaultReverseResolver2020",
        ]) {
          const answers = yield* succeeds(() =>
            client.readContract({
              address: contracts[key] as Address,
              abi: resolver,
              functionName: "supportsInterface",
              args: ["0x01ffc9a7"],
            }),
          );
          assert.isFalse(answers, key);
        }
      }),
    );

    it.effect("the 2020 controller registers until the ENSv2 launch", () =>
      Effect.gen(function* () {
        const { client, contracts } = yield* Devnet;
        const isController = yield* Effect.promise(() =>
          client.readContract({
            address: contracts["v1.baseRegistrar"] as Address,
            abi: controllers,
            functionName: "controllers",
            args: [contracts["v1.legacyEthRegistrarController"] as Address],
          }),
        );
        assert.isTrue(isController);
      }),
    );

    it.effect("hostile mocks revert, burn gas and return a megabyte", () =>
      Effect.gen(function* () {
        const { client, contracts } = yield* Devnet;
        const call = (key: string, gas?: bigint) =>
          Effect.promise(() =>
            client
              .call({
                to: contracts[key] as Address,
                data: "0x01ffc9a7",
                ...(gas === undefined ? {} : { gas }),
              })
              .then(
                (result) => ({ ok: true as const, size: ((result.data ?? "0x").length - 2) / 2 }),
                () => ({ ok: false as const, size: 0 }),
              ),
          );

        assert.deepStrictEqual(yield* call("mock.hostile.revert"), { ok: false, size: 0 });
        assert.deepStrictEqual(yield* call("mock.hostile.burnGas", 1_000_000n), {
          ok: false,
          size: 0,
        });
        assert.deepStrictEqual(yield* call("mock.hostile.returnLarge"), {
          ok: true,
          size: 1 << 20,
        });
      }),
    );
  });

  chainLayer("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("no ENSv1 controller registers after the launch", () =>
      Effect.gen(function* () {
        const { client, contracts } = yield* Devnet;
        for (const key of [
          "v1.legacyEthRegistrarController",
          "v1.ethRegistrarController",
          "v1.wrappedEthRegistrarController",
          "v1.nameWrapper",
        ]) {
          const isController = yield* Effect.promise(() =>
            client.readContract({
              address: contracts["v1.baseRegistrar"] as Address,
              abi: controllers,
              functionName: "controllers",
              args: [contracts[key] as Address],
            }),
          );
          assert.isFalse(isController, key);
        }
      }),
    );
  });
});
