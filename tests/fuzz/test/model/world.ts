import { Effect, Schema } from "effect";

import { Abis } from "@ensforge/contracts";
import type { DevnetInstance } from "@ensforge/test-devnet";
import type { FixturesApi } from "@ensforge/test-fixtures";
import { labelhash, namehash, zeroAddress, type Abi, type Address } from "viem";

/** The accounts commands act as. */
export const actorNames = ["alice", "bob", "carol"] as const;
export type ActorName = (typeof actorNames)[number];

/** ENSv2 `.eth` labels the fuzzer registers; none exist on the profile. */
export const v2Labels = ["fuzzalpha", "fuzzbeta", "fuzzgamma"] as const;

/** Seeded ENSv1 names the fuzzer mutates: an unwrapped and a wrapped `.eth` name of alice, both reachable after the launch. */
export const v1Fixtures = ["records.v1", "v1.wrapped"] as const;

/** The label of every subname commands create. */
export const subLabel = "sub";

/** Chain constants the model needs, read once from the deployment. */
export type Constants = {
  readonly gracePeriod: bigint;
  readonly v1GracePeriod: bigint;
  readonly usdc: Address;
};

/** Everything a sequence runs against: the devnet, the actors and the names. */
export type World = {
  readonly devnet: DevnetInstance;
  readonly actors: Readonly<Record<ActorName, Address>>;
  readonly v1Names: readonly string[];
  readonly constants: Constants;
};

/** A contract read that reverted or could not be made. */
class ReadError extends Schema.TaggedError<ReadError>()("ReadError", { cause: Schema.Defect() }) {}

const read = <A>(
  devnet: DevnetInstance,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
) =>
  Effect.tryPromise({
    try: () =>
      devnet.client.readContract({ address, abi, functionName, args } as never) as Promise<A>,
    catch: (cause) => new ReadError({ cause }),
  });

const contract = (devnet: DevnetInstance, key: string) => devnet.contracts[key] as Address;

export const makeWorld = Effect.fnUntraced(function* (
  devnet: DevnetInstance,
  fixtures: FixturesApi,
) {
  const [gracePeriod, v1GracePeriod] = yield* Effect.all([
    read<bigint>(devnet, contract(devnet, "v2.ethRegistrar"), Abis.v2.ethRegistrar, "GRACE_PERIOD"),
    read<bigint>(
      devnet,
      contract(devnet, "v1.baseRegistrar"),
      Abis.v1.baseRegistrar,
      "GRACE_PERIOD",
    ),
  ]).pipe(Effect.orDie);
  const { alice, bob, carol } = devnet.accounts;
  return {
    devnet,
    actors: { alice, bob, carol },
    v1Names: v1Fixtures.map((id) => fixtures.byId(id).name),
    constants: { gracePeriod, v1GracePeriod, usdc: contract(devnet, "v2.usdc") },
  } satisfies World;
});

/** Funds every actor with the payment token, inside the sequence's snapshot. */
export const fund = (world: World) =>
  Effect.forEach(
    Object.values(world.actors),
    (actor) =>
      Effect.promise(async () => {
        const hash = await world.devnet.client.writeContract({
          account: actor,
          chain: world.devnet.chain,
          address: world.constants.usdc,
          abi: [
            {
              type: "function",
              name: "mint",
              stateMutability: "nonpayable",
              inputs: [
                { name: "to", type: "address" },
                { name: "amount", type: "uint256" },
              ],
              outputs: [],
            },
          ],
          functionName: "mint",
          args: [actor, 10n ** 18n],
        });
        await world.devnet.client.waitForTransactionReceipt({ hash });
      }),
    { discard: true },
  );

/** The chain's latest block timestamp. */
export const chainTime = (world: World) =>
  Effect.promise(() => world.devnet.client.getBlock()).pipe(Effect.map((block) => block.timestamp));

/** Mines one block at `timestamp`. */
export const travelTo = (world: World, timestamp: bigint) =>
  Effect.promise(async () => {
    await world.devnet.client.setNextBlockTimestamp({ timestamp });
    await world.devnet.client.mine({ blocks: 1 });
  });

/** An ENSv2 `.eth` entry as the ETH registry stores it. */
export const readV2 = Effect.fnUntraced(function* (world: World, label: string) {
  const registry = contract(world.devnet, "v2.ethRegistry");
  const abi = Abis.v2.permissionedRegistry;
  const [owner, expiry, resolver, subregistry] = yield* Effect.all([
    read<Address>(world.devnet, registry, abi, "findOwner", [label]),
    read<bigint>(world.devnet, registry, abi, "findExpiry", [label]),
    read<Address>(world.devnet, registry, abi, "getResolver", [label]),
    read<Address>(world.devnet, registry, abi, "getSubregistry", [label]),
  ]).pipe(Effect.orDie);
  return {
    owner: owner === zeroAddress ? null : owner,
    expiry,
    resolver: resolver === zeroAddress ? null : resolver,
    subregistry: subregistry === zeroAddress ? null : subregistry,
  };
});

/** An ENSv1 `.eth` name: registry entry, registrar token and NameWrapper data. */
export const readV1 = Effect.fnUntraced(function* (world: World, name: string) {
  const { devnet } = world;
  const node = namehash(name);
  const label = name.slice(0, -".eth".length);
  const [manager, resolver, registrant, expiry, wrapped] = yield* Effect.all([
    read<Address>(devnet, contract(devnet, "v1.registry"), Abis.v1.ensRegistry, "owner", [node]),
    read<Address>(devnet, contract(devnet, "v1.registry"), Abis.v1.ensRegistry, "resolver", [node]),
    read<Address>(devnet, contract(devnet, "v1.baseRegistrar"), Abis.v1.baseRegistrar, "ownerOf", [
      BigInt(labelhash(label)),
    ]).pipe(Effect.orElseSucceed(() => zeroAddress)),
    read<bigint>(
      devnet,
      contract(devnet, "v1.baseRegistrar"),
      Abis.v1.baseRegistrar,
      "nameExpires",
      [BigInt(labelhash(label))],
    ),
    read<readonly [Address, number, bigint]>(
      devnet,
      contract(devnet, "v1.nameWrapper"),
      Abis.v1.nameWrapper,
      "getData",
      [BigInt(node)],
    ),
  ]).pipe(Effect.orDie);
  const isWrapped = manager === contract(devnet, "v1.nameWrapper");
  return {
    manager: isWrapped ? wrapped[0] : manager,
    registrant,
    resolver: resolver === zeroAddress ? null : resolver,
    expiry,
    wrapped: isWrapped,
    fuses: wrapped[1],
  };
});
