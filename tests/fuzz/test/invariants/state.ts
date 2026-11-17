import { Effect } from "effect";

import { isAddressEqual, type Address } from "viem";

import { SequenceFailure, type Context } from "../model/command.ts";
import { v1Status, v2Status, type Model } from "../model/model.ts";
import { v2Labels } from "../model/world.ts";

const sameAddress = (actual: Address | null, expected: Address | null) =>
  actual === null || expected === null ? actual === expected : isAddressEqual(actual, expected);

const mismatch = (name: string, field: string, actual: unknown, expected: unknown) =>
  new SequenceFailure({
    message: `${name}: ensforge reads ${field} ${String(actual)}, the model ${String(expected)}`,
  });

/** ensforge's `name.get` and `record.getText` agree with the model for every name. */
export const readsMatchModel = Effect.fnUntraced(function* (context: Context, model: Model) {
  const { reader, world } = context;

  for (const label of v2Labels) {
    const name = `${label}.eth`;
    const entry = model.v2[label];
    const status = v2Status(model, world.constants, label);
    const state = yield* Effect.promise(() => reader.name.get({ name }));
    if (state.status !== status) return yield* mismatch(name, "status", state.status, status);
    if (entry === undefined) continue;

    const owner = status === "registered" ? entry.owner : null;
    if (!sameAddress(state.owner, owner)) return yield* mismatch(name, "owner", state.owner, owner);
    if (state.expiry !== entry.expiry)
      return yield* mismatch(name, "expiry", state.expiry, entry.expiry);
    if (status !== "registered") continue;
    if (!sameAddress(state.resolver, entry.resolver)) {
      return yield* mismatch(name, "resolver", state.resolver, entry.resolver);
    }
    const url = yield* Effect.promise(() => reader.record.getText({ name, key: "url" }));
    if (url !== entry.url) return yield* mismatch(name, "text url", url, entry.url);
  }

  for (const name of world.v1Names) {
    const entry = model.v1[name];
    if (entry === undefined || entry.migrated) continue;
    const status = v1Status(model, world.constants, name);
    const state = yield* Effect.promise(() => reader.name.get({ name }));
    if (state.status !== status) return yield* mismatch(name, "status", state.status, status);
    if (state.wrapped !== entry.wrapped)
      return yield* mismatch(name, "wrapped", state.wrapped, entry.wrapped);
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
    // After the launch an ENSv1 name resolves through its ENSv2 reservation, which ends at expiry.
    if (status !== "registered") continue;
    const url = yield* Effect.promise(() => reader.record.getText({ name, key: "url" }));
    if (url !== entry.url) return yield* mismatch(name, "text url", url, entry.url);
  }
});
