import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { namehash, type Address } from "viem";

import { withV1, type Model, type V1Name } from "./model.ts";
import { chainTime, readV1, type World } from "./world.ts";

/** The `url` text record a resolver holds for `name`, read from the resolver itself. */
export const readUrl = (world: World, resolver: Address | null, name: string) =>
  resolver === null
    ? Effect.succeed(null)
    : Effect.promise(() =>
        world.devnet.client
          .readContract({
            address: resolver,
            abi: Abis.shared.textResolver,
            functionName: "text",
            args: [namehash(name), "url"],
          })
          .then(
            (url) => (url === "" ? null : url),
            () => null,
          ),
      );

const v1Entry = Effect.fnUntraced(function* (world: World, name: string, previous?: V1Name) {
  const state = yield* readV1(world, name);
  return {
    wrapped: state.wrapped,
    manager: state.manager,
    registrant: state.registrant,
    expiry: state.expiry,
    resolver: state.resolver,
    fuses: state.fuses,
    url: yield* readUrl(world, state.resolver, name),
    sub: previous?.sub ?? null,
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
  } satisfies Model;
});

/** Replaces an ENSv1 name's model with the chain's state, for outcomes the model leaves open. */
export const resyncV1 = Effect.fnUntraced(function* (world: World, model: Model, name: string) {
  return withV1(model, name, yield* v1Entry(world, name, model.v1[name]));
});
