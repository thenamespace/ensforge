import { Effect, Record as Rec, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { Chain, Devnet } from "@ensforge/test-devnet";
import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  namehash,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

import { withV1, withV2, type Model, type Primary, type V1Name, type V2Name } from "./model.ts";
import { readV1, readV2, type World } from "./world.ts";

/**
 * Calls a resolver for `name`: through ENSIP-10 `resolve` first (ENSv2's PermissionedResolver
 * answers only that way), then directly. `null` when neither answers.
 */
const callResolver = Effect.fnUntraced(function* (
  resolver: Address | null,
  name: string,
  data: Hex,
) {
  if (resolver === null) return null;
  const chain = yield* Chain;

  const reply = yield* chain
    .read({
      address: resolver,
      abi: Abis.shared.extendedResolver,
      functionName: "resolve",
      args: [Name.dnsEncode(name), data],
    })
    .pipe(
      Effect.catch(() => Effect.map(chain.call({ to: resolver, data }), (call) => call.data)),
      Effect.orElseSucceed(() => undefined),
    );
  return reply === undefined || reply === "0x" ? null : reply;
});

/** The `url` text record a resolver holds for `name`, read from the resolver itself. */
export const readUrl = (resolver: Address | null, name: string) => {
  const call = { abi: Abis.shared.textResolver, functionName: "text" } as const;
  const data = encodeFunctionData({ ...call, args: [namehash(name), "url"] });
  return Effect.map(callResolver(resolver, name, data), (result) => {
    const url = result === null ? "" : decodeFunctionResult({ ...call, data: result });
    return url === "" ? null : url;
  });
};

/** The ETH address record a resolver holds for `name`. */
const readAddr = (resolver: Address | null, name: string) => {
  const call = { abi: Abis.shared.addrResolver, functionName: "addr" } as const;
  const data = encodeFunctionData({ ...call, args: [namehash(name)] });
  return Effect.map(callResolver(resolver, name, data), (result) => {
    const addr = result === null ? zeroAddress : decodeFunctionResult({ ...call, data: result });
    return BigInt(addr) === 0n ? null : getAddress(addr);
  });
};

const v1Entry = Effect.fnUntraced(function* (name: string, previous?: V1Name) {
  const state = yield* readV1(name);
  return {
    wrapped: state.wrapped,
    manager: state.manager,
    registrant: state.registrant,
    expiry: state.expiry,
    resolver: state.resolver,
    ownResolver: previous?.ownResolver ?? state.resolver,
    fuses: state.fuses,
    url: yield* readUrl(state.resolver, name),
    addr: yield* readAddr(state.resolver, name),
    sub: previous?.sub ?? null,
    reservation: (yield* readV2(Name.parse(name).label)).expiry,
    migrated: previous?.migrated ?? false,
  } satisfies V1Name;
});

/** An address's reverse records as the chain holds them (see {@link Primary}). */
const readPrimary = Effect.fnUntraced(function* (address: Address) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;
  const node = namehash(`${Str.toLowerCase(Str.slice(2)(address))}.addr.reverse`);
  const resolver = yield* Effect.orDie(
    chain.read({
      address: devnet.contract("v1.registry"),
      abi: Abis.v1.ensRegistry,
      functionName: "resolver",
      args: [node],
    }),
  );
  const eth =
    BigInt(resolver) === 0n
      ? null
      : yield* chain
          .read({
            address: resolver,
            abi: Abis.v1.publicResolver,
            functionName: "name",
            args: [node],
          })
          .pipe(Effect.orElseSucceed(() => ""));
  const fallback = yield* Effect.orDie(
    chain.read({
      address: devnet.contract("v1.defaultReverseRegistrar"),
      abi: Abis.v1.defaultReverseRegistrar,
      functionName: "nameForAddr",
      args: [address],
    }),
  );
  return { eth, fallback } satisfies Primary;
});

/** The model at the start of a sequence: the seeded ENSv1 names and reverse records. */
export const initialModel = Effect.fnUntraced(function* (world: World) {
  const chain = yield* Chain;
  const entries = yield* Effect.forEach(
    world.v1Names,
    (name) => Effect.map(v1Entry(name), (entry) => [name, entry] as const),
    { concurrency: 1 },
  );
  const primary = yield* Effect.forEach(
    Rec.values(world.actors),
    (address) => Effect.map(readPrimary(address), (records) => [address, records] as const),
    { concurrency: 1 },
  );
  return {
    now: yield* Effect.orDie(chain.now),
    v2: {},
    v1: Rec.fromEntries(entries),
    primary: Rec.fromEntries(primary),
    operators: {},
  } satisfies Model;
});

/** Replaces an ENSv1 name's model with the chain's state, for outcomes the model leaves open. */
export const resyncV1 = Effect.fnUntraced(function* (model: Model, name: string) {
  const entry = yield* v1Entry(name, model.v1[name]);
  return withV1(model, name, entry);
});

/**
 * Replaces an ENSv2 name's owner, expiry, resolver and records with the chain's state, keeping
 * what the chain does not say (delegates, records admin).
 */
export const resyncV2 = Effect.fnUntraced(function* (
  model: Model,
  label: string,
  previous: Partial<V2Name> = {},
) {
  const name = `${label}.eth`;
  const state = yield* readV2(label);
  if (state.owner === null) return withV2(model, label, undefined);

  return withV2(model, label, {
    owner: state.owner,
    expiry: state.expiry,
    resolver: state.resolver,
    ownResolver: previous.ownResolver ?? state.resolver,
    recordsAdmin: previous.recordsAdmin ?? null,
    url: previous.url !== undefined ? previous.url : yield* readUrl(state.resolver, name),
    addr: previous.addr !== undefined ? previous.addr : yield* readAddr(state.resolver, name),
    delegates: previous.delegates ?? [],
    sub: previous.sub ?? null,
    subregistryAdmin: previous.subregistryAdmin ?? null,
  });
});
