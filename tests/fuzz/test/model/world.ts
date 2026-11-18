import { Effect, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { v1Owners } from "@ensforge/test-integration/support/contracts";
import { namehash, zeroAddress, type Address } from "viem";

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
};

/** Everything a sequence runs against: the actors, the names and the chain's constants. */
export type World = {
  readonly actors: Readonly<Record<ActorName, Address>>;
  readonly v1Names: readonly string[];
  readonly constants: Constants;
};

export const makeWorld = Effect.gen(function* () {
  const devnet = yield* Devnet;
  const chain = yield* Chain;
  const fixtures = yield* Fixtures;
  const [gracePeriod, v1GracePeriod] = yield* Effect.all(
    [
      chain.read({
        address: devnet.contract("v2.ethRegistrar"),
        abi: Abis.v2.ethRegistrar,
        functionName: "GRACE_PERIOD",
      }),
      chain.read({
        address: devnet.contract("v1.baseRegistrar"),
        abi: Abis.v1.baseRegistrar,
        functionName: "GRACE_PERIOD",
      }),
    ],
    { concurrency: 1 },
  ).pipe(Effect.orDie);
  const { alice, bob, carol } = devnet.accounts;

  return {
    actors: { alice, bob, carol },
    v1Names: Arr.map(v1Fixtures, (id) => fixtures.byId(id).name),
    constants: { gracePeriod, v1GracePeriod },
  } satisfies World;
});

/** An ENSv2 `.eth` entry as the ETH registry stores it. */
export const readV2 = Effect.fnUntraced(function* (label: string) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;
  const registry = {
    address: devnet.contract("v2.ethRegistry"),
    abi: Abis.v2.permissionedRegistry,
  } as const;

  const { owner, expiry, resolver, subregistry } = yield* Effect.all(
    {
      owner: chain.read({ ...registry, functionName: "findOwner", args: [label] }),
      expiry: chain.read({ ...registry, functionName: "findExpiry", args: [label] }),
      resolver: chain.read({ ...registry, functionName: "getResolver", args: [label] }),
      subregistry: chain.read({ ...registry, functionName: "getSubregistry", args: [label] }),
    },
    { concurrency: 1 },
  ).pipe(Effect.orDie);
  return {
    owner: owner === zeroAddress ? null : owner,
    expiry,
    resolver: resolver === zeroAddress ? null : resolver,
    subregistry: subregistry === zeroAddress ? null : subregistry,
  };
});

/** An ENSv1 `.eth` name: registry entry, registrar token and NameWrapper data. */
export const readV1 = Effect.fnUntraced(function* (name: string) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;

  const [owners, resolver, expiry] = yield* Effect.all(
    [
      v1Owners(name),
      chain.read({
        address: devnet.contract("v1.registry"),
        abi: Abis.v1.ensRegistry,
        functionName: "resolver",
        args: [namehash(name)],
      }),
      chain.read({
        address: devnet.contract("v1.baseRegistrar"),
        abi: Abis.v1.baseRegistrar,
        functionName: "nameExpires",
        args: [Name.toTokenId(name)],
      }),
    ],
    { concurrency: 1 },
  ).pipe(Effect.orDie);
  const wrapped = owners.registry === devnet.contract("v1.nameWrapper");
  return {
    manager: wrapped ? (owners.wrapped?.[0] ?? zeroAddress) : owners.registry,
    registrant: owners.registrant ?? zeroAddress,
    resolver: resolver === zeroAddress ? null : resolver,
    expiry,
    wrapped,
    fuses: owners.wrapped?.[1] ?? 0,
  };
});
