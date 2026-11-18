import { describe, it } from "@effect/vitest";

import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";

import { clientFor, now, other, resolverA, signer, type Entry } from "./world.js";

// Once ENSv2 resolution no longer reaches an ENSv1 name, the actions that change it refuse it
// with NAME_UNREACHABLE instead of writing a record nothing resolves.

const unwrapped: Entry = { v1: { owner: signer } };
const wrapped: Entry = {
  v1: { owner: signer, wrapper: { owner: signer, fuses: 0, expiry: now + 1000n } },
};
const world = (entry: Entry) => clientFor({ name: "alice.eth", ...entry, unreachableFromV2: true });
const parentOf = (entry: Entry) =>
  clientFor({ name: "pay.alice.eth", names: { "alice.eth": entry }, unreachableFromV2: true });

describe("a name ENSv2 no longer reaches", () => {
  it.effect.each([
    [
      "dns.setRecords",
      () =>
        Actions.dns.setRecords.prepare(world(unwrapped).ens, { name: "alice.eth", zonehash: null }),
    ],
    [
      "name.reclaim",
      () => Actions.name.reclaim.prepare(world(unwrapped).ens, { name: "alice.eth" }),
    ],
    [
      "name.setManager",
      () =>
        Actions.name.setManager.prepare(world(unwrapped).ens, {
          name: "alice.eth",
          manager: other,
        }),
    ],
    [
      "name.setTtl",
      () => Actions.name.setTtl.prepare(world(unwrapped).ens, { name: "alice.eth", ttl: 60n }),
    ],
    [
      "registry.attach",
      () =>
        Actions.registry.attach.prepare(world(unwrapped).ens, {
          name: "alice.eth",
          registry: null,
        }),
    ],
    [
      "resolver.create",
      () => Actions.resolver.create.prepare(world(unwrapped).ens, { name: "alice.eth" }),
    ],
    [
      "resolver.link",
      () =>
        Actions.resolver.link.prepare(world(unwrapped).ens, { name: "alice.eth", to: resolverA }),
    ],
    [
      "resolver.set",
      () =>
        Actions.resolver.set.prepare(world(unwrapped).ens, {
          name: "alice.eth",
          resolver: resolverA,
        }),
    ],
    [
      "subname.create",
      () =>
        Actions.subname.create.prepare(parentOf(unwrapped).ens, {
          name: "pay.alice.eth",
          owner: other,
        }),
    ],
    [
      "subname.update",
      () =>
        Actions.subname.update.prepare(parentOf(unwrapped).ens, {
          name: "pay.alice.eth",
          owner: other,
        }),
    ],
    [
      "wrapper.setChildFuses",
      () =>
        Actions.wrapper.setChildFuses.prepare(world(wrapped).ens, {
          name: "alice.eth",
          expiry: 1n,
        }),
    ],
    [
      "wrapper.setFuses",
      () =>
        Actions.wrapper.setFuses.prepare(world(wrapped).ens, {
          name: "alice.eth",
          fuses: ["cannotUnwrap"],
        }),
    ],
    [
      "wrapper.unwrap",
      () => Actions.wrapper.unwrap.prepare(world(wrapped).ens, { name: "alice.eth" }),
    ],
    [
      "wrapper.wrap",
      () => Actions.wrapper.wrap.prepare(world(unwrapped).ens, { name: "alice.eth" }),
    ],
  ] as const)("%s fails with NAME_UNREACHABLE", ([, prepare]) =>
    expectFailure(prepare(), { _tag: "NameStateError", code: "NAME_UNREACHABLE" }),
  );
});
