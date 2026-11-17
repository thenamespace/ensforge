import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  bytesToHex,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  namehash,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { packetToBytes } from "viem/ens";

import { labelOf, withV1, withV2, type Model, type V1Name, type V2Name } from "./model.ts";
import { chainTime, readV1, readV2, type World } from "./world.ts";

/**
 * Calls a resolver for `name`: through ENSIP-10 `resolve` first (ENSv2's PermissionedResolver
 * answers only that way), then directly. `null` when neither answers.
 */
const callResolver = (world: World, resolver: Address | null, name: string, data: Hex) =>
  resolver === null
    ? Effect.succeed(null)
    : Effect.promise(() =>
        world.devnet.client
          .readContract({
            address: resolver,
            abi: Abis.shared.extendedResolver,
            functionName: "resolve",
            args: [bytesToHex(packetToBytes(name)), data],
          })
          .catch(() => world.devnet.client.call({ to: resolver, data }).then((reply) => reply.data))
          .then(
            (result) => (result === undefined || result === "0x" ? null : result),
            () => null,
          ),
      );

/** The `url` text record a resolver holds for `name`, read from the resolver itself. */
export const readUrl = (world: World, resolver: Address | null, name: string) => {
  const call = { abi: Abis.shared.textResolver, functionName: "text" } as const;
  const data = encodeFunctionData({ ...call, args: [namehash(name), "url"] });
  return Effect.map(callResolver(world, resolver, name, data), (result) => {
    const url = result === null ? "" : decodeFunctionResult({ ...call, data: result });
    return url === "" ? null : url;
  });
};

/** The ETH address record a resolver holds for `name`. */
export const readAddr = (world: World, resolver: Address | null, name: string) => {
  const call = { abi: Abis.shared.addrResolver, functionName: "addr" } as const;
  const data = encodeFunctionData({ ...call, args: [namehash(name)] });
  return Effect.map(callResolver(world, resolver, name, data), (result) => {
    const addr = result === null ? zeroAddress : decodeFunctionResult({ ...call, data: result });
    return BigInt(addr) === 0n ? null : getAddress(addr);
  });
};

const v1Entry = Effect.fnUntraced(function* (world: World, name: string, previous?: V1Name) {
  const state = yield* readV1(world, name);
  return {
    wrapped: state.wrapped,
    manager: state.manager,
    registrant: state.registrant,
    expiry: state.expiry,
    resolver: state.resolver,
    ownResolver: previous?.ownResolver ?? state.resolver,
    fuses: state.fuses,
    url: yield* readUrl(world, state.resolver, name),
    addr: yield* readAddr(world, state.resolver, name),
    sub: previous?.sub ?? null,
    reservation: (yield* readV2(world, labelOf(name))).expiry,
    migrated: previous?.migrated ?? false,
  } satisfies V1Name;
});

/** The model at the start of a sequence: the seeded ENSv1 names, no fuzz names yet. */
export const initialModel = Effect.fnUntraced(function* (world: World) {
  const entries = yield* Effect.forEach(world.v1Names, (name) =>
    Effect.map(v1Entry(world, name), (entry) => [name, entry] as const),
  );
  return {
    now: yield* chainTime(world),
    v2: {},
    v1: Object.fromEntries(entries),
    primary: {},
    operators: {},
  } satisfies Model;
});

/** Replaces an ENSv1 name's model with the chain's state, for outcomes the model leaves open. */
export const resyncV1 = Effect.fnUntraced(function* (world: World, model: Model, name: string) {
  return withV1(model, name, yield* v1Entry(world, name, model.v1[name]));
});

/**
 * Replaces an ENSv2 name's owner, expiry, resolver and records with the chain's state, keeping
 * what the chain does not say (delegates, records admin).
 */
export const resyncV2 = Effect.fnUntraced(function* (
  world: World,
  model: Model,
  label: string,
  previous: Partial<V2Name> = {},
) {
  const name = `${label}.eth`;
  const state = yield* readV2(world, label);
  if (state.owner === null) return withV2(model, label, undefined);
  return withV2(model, label, {
    owner: state.owner,
    expiry: state.expiry,
    resolver: state.resolver,
    ownResolver: previous.ownResolver ?? state.resolver,
    recordsAdmin: previous.recordsAdmin ?? null,
    url: previous.url !== undefined ? previous.url : yield* readUrl(world, state.resolver, name),
    addr:
      previous.addr !== undefined ? previous.addr : yield* readAddr(world, state.resolver, name),
    delegates: previous.delegates ?? [],
    sub: previous.sub ?? null,
    subregistryAdmin: previous.subregistryAdmin ?? null,
  });
});
