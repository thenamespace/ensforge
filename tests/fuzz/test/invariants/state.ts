import { Effect } from "effect";

import { isAddressEqual, type Address } from "viem";

import { forwardOf } from "../commands/primary.ts";
import { SequenceFailure, type Context } from "../model/command.ts";
import { labelOf, v1Resolves, v1Status, v2Status, type Model } from "../model/model.ts";
import { subLabel, v2Labels } from "../model/world.ts";

const sameAddress = (actual: Address | null, expected: Address | null) =>
  actual === null || expected === null ? actual === expected : isAddressEqual(actual, expected);

const mismatch = (name: string, field: string, actual: unknown, expected: unknown) =>
  new SequenceFailure({
    message: `${name}: ensforge reads ${field} ${String(actual)}, the model ${String(expected)}`,
  });

/** `sub.<name>`'s holder: none when the model has none, the model's while it is registered. */
const checkSub = Effect.fnUntraced(function* (
  context: Context,
  parent: string,
  sub: Address | null,
) {
  const name = `${subLabel}.${parent}`;
  const state = yield* Effect.promise(() => context.reader.name.get({ name }));
  if (sub === null && state.owner !== null)
    return yield* mismatch(name, "owner", state.owner, null);
  if (sub !== null && state.status === "registered" && !sameAddress(state.owner, sub)) {
    return yield* mismatch(name, "owner", state.owner, sub);
  }
});

/** ensforge's name, record and primary-name reads agree with the model. */
export const readsMatchModel = Effect.fnUntraced(function* (context: Context, model: Model) {
  const { reader, world } = context;
  const migrated = world.v1Names.filter((name) => model.v1[name]?.migrated === true);

  for (const label of [...v2Labels, ...migrated.map(labelOf)]) {
    const name = `${label}.eth`;
    const entry = model.v2[label];
    const status = v2Status(model, world.constants, label);
    const state = yield* Effect.promise(() => reader.name.get({ name }));
    if (state.status !== status) return yield* mismatch(name, "status", state.status, status);
    if (entry === undefined) continue;

    const owner = status === "registered" ? entry.owner : null;
    if (!sameAddress(state.owner, owner)) return yield* mismatch(name, "owner", state.owner, owner);
    if (state.expiry !== entry.expiry) {
      return yield* mismatch(name, "expiry", state.expiry, entry.expiry);
    }
    if (status !== "registered") continue;
    if (!sameAddress(state.resolver, entry.resolver)) {
      return yield* mismatch(name, "resolver", state.resolver, entry.resolver);
    }
    const url = yield* Effect.promise(() => reader.record.getText({ name, key: "url" }));
    const expectedUrl = entry.resolver === null ? null : entry.url;
    if (url !== expectedUrl) return yield* mismatch(name, "text url", url, expectedUrl);
    yield* checkSub(context, name, entry.sub);
  }

  for (const name of world.v1Names) {
    const entry = model.v1[name];
    if (entry === undefined || entry.migrated) continue;
    const status = v1Status(model, world.constants, name);
    const state = yield* Effect.promise(() => reader.name.get({ name }));
    if (state.status !== status) return yield* mismatch(name, "status", state.status, status);
    if (state.wrapped !== entry.wrapped) {
      return yield* mismatch(name, "wrapped", state.wrapped, entry.wrapped);
    }
    if (status === "expired") continue;

    // A registrar token has no holder once it expires, grace included; a wrapped token keeps
    // its holder through grace.
    const owner = entry.wrapped ? entry.manager : status === "registered" ? entry.registrant : null;
    if (!sameAddress(state.owner, owner)) return yield* mismatch(name, "owner", state.owner, owner);
    const manager = entry.wrapped ? null : entry.manager;
    if (!sameAddress(state.manager, manager)) {
      return yield* mismatch(name, "manager", state.manager, manager);
    }
    if (!sameAddress(state.resolver, entry.resolver)) {
      return yield* mismatch(name, "resolver", state.resolver, entry.resolver);
    }
    if (!v1Resolves(model, name)) continue;
    const url = yield* Effect.promise(() => reader.record.getText({ name, key: "url" }));
    const expectedUrl = entry.resolver === null ? null : entry.url;
    if (url !== expectedUrl) return yield* mismatch(name, "text url", url, expectedUrl);
    yield* checkSub(context, name, entry.sub);
  }

  // Only actors whose primary name a command set are known to the model.
  for (const [address, primary] of Object.entries(model.primary) as [Address, string | null][]) {
    const expected =
      primary !== null && forwardOf(model, world, primary) === address ? primary : null;
    const actual = yield* Effect.promise(() => reader.primaryName.get({ address }));
    if (actual !== expected) return yield* mismatch(address, "primary name", actual, expected);
  }
});
