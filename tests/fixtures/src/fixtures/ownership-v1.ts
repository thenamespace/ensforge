import { Array as Arr, Effect } from "effect";

import { labelhash, namehash, zeroAddress, type Address } from "viem";

import { expectState } from "../builders/check.ts";
import { labelId } from "../builders/names.ts";
import { oldRegistryName, registerV1, v1Subname } from "../builders/v1.ts";
import type { Fixture } from "../fixture.ts";
import { days, durations } from "./durations.ts";

/** ENSv1 ownership: registrant vs manager, subnames, expiry states and the 2017 registry. */
export const ownershipV1: readonly Fixture[] = [
  {
    id: "v1.unwrapped",
    cases: ["M:A2", "O19", "M:D1", "T01", "M:E1", "M:E2", "M:E3"],
    tags: { kind: "v1-unwrapped", state: "registered" },
    unreserved: true,
    prelaunch: (c) =>
      registerV1({
        label: "v1-plain",
        owner: c.accounts.alice,
        duration: durations.active,
      }).pipe(Effect.map((name) => ({ ...name, owner: c.accounts.alice }))),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* c.read("v1.registry", "owner", [facts["node"]]);
        yield* expectState("v1.unwrapped", "manager", owner, c.accounts.alice);
        const registrant = yield* c.read("v1.baseRegistrar", "ownerOf", [labelId("v1-plain")]);
        yield* expectState("v1.unwrapped", "registrant", registrant, c.accounts.alice);
      }),
  },
  {
    id: "v1.unwrapped.manager",
    cases: ["M:A3", "M:D2", "M:D3"],
    tags: { kind: "v1-unwrapped", state: "registered", roles: "registrant-not-manager" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV1({
          label: "v1-managed",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        yield* c.write("v1.registry", "setOwner", [name.node, c.accounts.bob], {
          from: c.accounts.alice,
        });
        return { ...name, registrant: c.accounts.alice, manager: c.accounts.bob };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const manager = yield* c.read("v1.registry", "owner", [facts["node"]]);
        yield* expectState("v1.unwrapped.manager", "manager", manager, facts["manager"]);
        const registrant = yield* c.read("v1.baseRegistrar", "ownerOf", [labelId("v1-managed")]);
        yield* expectState("v1.unwrapped.manager", "registrant", registrant, facts["registrant"]);
      }),
  },
  {
    id: "v1.unwrapped.transferred",
    cases: ["O03"],
    tags: { kind: "v1-unwrapped", state: "registered", roles: "transferred-without-reclaim" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV1({
          label: "v1-handoff",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        yield* c.write(
          "v1.baseRegistrar",
          "transferFrom",
          [c.accounts.alice, c.accounts.bob, labelId("v1-handoff")],
          { from: c.accounts.alice },
        );
        return { ...name, registrant: c.accounts.bob, manager: c.accounts.alice };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const manager = yield* c.read("v1.registry", "owner", [facts["node"]]);
        yield* expectState("v1.unwrapped.transferred", "manager", manager, c.accounts.alice);
        const registrant = yield* c.read("v1.baseRegistrar", "ownerOf", [labelId("v1-handoff")]);
        yield* expectState("v1.unwrapped.transferred", "registrant", registrant, c.accounts.bob);
      }),
  },
  {
    id: "v1.unwrapped.registrar-only",
    cases: ["O04"],
    // Only a registrar controller can register without the registry: replayed as one.
    tags: {
      kind: "v1-unwrapped",
      state: "registered",
      roles: "no-manager",
      cheat: "impersonation",
    },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const controller = yield* c.address("v1.ethRegistrarController");
        yield* c.cheat((client) => client.impersonateAccount({ address: controller }));
        yield* c.cheat((client) => client.setBalance({ address: controller, value: 10n ** 18n }));
        yield* c.write(
          "v1.baseRegistrar",
          "registerOnly",
          [labelId("v1-orphan"), c.accounts.alice, durations.active],
          { from: controller },
        );
        yield* c.cheat((client) => client.stopImpersonatingAccount({ address: controller }));
        return { name: "v1-orphan.eth", registrant: c.accounts.alice };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const manager = yield* c.read("v1.registry", "owner", [namehash(String(facts["name"]))]);
        yield* expectState("v1.unwrapped.registrar-only", "manager", manager, zeroAddress);
        const registrant = yield* c.read("v1.baseRegistrar", "ownerOf", [labelId("v1-orphan")]);
        yield* expectState(
          "v1.unwrapped.registrar-only",
          "registrant",
          registrant,
          c.accounts.alice,
        );
      }),
  },
  {
    id: "v1.unwrapped.legacy-controller",
    cases: ["M:A2"],
    tags: { kind: "v1-unwrapped", state: "registered", controller: "2020" },
    prelaunch: (c) =>
      registerV1({
        label: "v1-legacy",
        owner: c.accounts.alice,
        duration: durations.active,
        controller: "legacy",
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const resolver = yield* c.read<Address>("v1.registry", "resolver", [facts["node"]]);
        const addr = yield* c.read([resolver, "v1/PublicResolver"], "addr", [facts["node"]]);
        yield* expectState("v1.unwrapped.legacy-controller", "addr", addr, c.accounts.alice);
      }),
  },
  ...Arr.map(
    [
      ["v1.unwrapped.grace", "v1-grace", durations.v1Grace, ["M:A5", "T02", "G12"], "grace"],
      ["v1.unwrapped.premium", "v1-premium", durations.v1Premium, ["G14", "T02"], "premium"],
      ["v1.unwrapped.expired", "v1-expired", durations.expired, ["M:A6", "O05", "T01"], "expired"],
    ] as const,
    ([id, label, duration, cases, state]): Fixture => ({
      id,
      cases,
      tags: { kind: "v1-unwrapped", state },
      prelaunch: (c) => registerV1({ label, owner: c.accounts.alice, duration }),
      check: (c, facts) =>
        Effect.gen(function* () {
          const now = c.time.now();
          const expiry = BigInt(String(facts["expiry"]));
          const graceEnd = expiry + days(90n);
          const premiumEnd = graceEnd + days(21n);
          const inState = {
            grace: now >= expiry && now < graceEnd,
            premium: now >= graceEnd && now < premiumEnd,
            expired: now >= premiumEnd,
          }[state];
          yield* expectState(id, `${state} at ${now}`, inState, true);
          // The registry keeps the stale manager.
          const manager = yield* c.read("v1.registry", "owner", [facts["node"]]);
          yield* expectState(id, "stale manager", manager, c.accounts.alice);
        }),
    }),
  ),
  {
    id: "v1.subname",
    cases: ["M:A4", "H24"],
    tags: { kind: "v1-unwrapped", state: "registered", depth: "3" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const parent = yield* registerV1({
          label: "v1-parent",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        yield* v1Subname({
          parent: parent.name,
          label: "sub",
          parentOwner: c.accounts.alice,
          owner: c.accounts.alice,
        });
        const deep = yield* v1Subname({
          parent: `sub.${parent.name}`,
          label: "deep",
          parentOwner: c.accounts.alice,
          owner: c.accounts.bob,
        });
        return { name: deep.name, parent: `sub.${parent.name}`, owner: c.accounts.bob };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* c.read("v1.registry", "owner", [namehash(String(facts["name"]))]);
        yield* expectState("v1.subname", "owner", owner, c.accounts.bob);
      }),
  },
  {
    id: "v1.subname.deleted",
    cases: ["O12"],
    tags: { kind: "v1-unwrapped", state: "deleted" },
    // Unreserved, ENSv2 does not serve the resolver the deleted record keeps.
    unreserved: true,
    prelaunch: (c) =>
      Effect.gen(function* () {
        const parent = yield* registerV1({
          label: "v1-cleared",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        const sub = yield* v1Subname({
          parent: parent.name,
          label: "gone",
          parentOwner: c.accounts.alice,
          owner: c.accounts.alice,
        });
        yield* c.write("v1.registry", "setOwner", [sub.node, zeroAddress], {
          from: c.accounts.alice,
        });
        return { name: sub.name, resolver: sub.resolver };
      }),
    // Clearing the owner stores the registry itself: `owner` reads zero, but the record exists, so
    // the name never falls back to the old registry, and its resolver stays.
    check: (c, facts) =>
      Effect.gen(function* () {
        const node = namehash(String(facts["name"]));
        const owner = yield* c.read("v1.registry", "owner", [node]);
        yield* expectState("v1.subname.deleted", "owner", owner, zeroAddress);
        const exists = yield* c.read("v1.registry", "recordExists", [node]);
        yield* expectState("v1.subname.deleted", "record exists", exists, true);
        const resolver = yield* c.read("v1.registry", "resolver", [node]);
        yield* expectState("v1.subname.deleted", "resolver kept", resolver, facts["resolver"]);
      }),
  },
  {
    id: "v1.old-registry",
    cases: ["O01", "M:B2"],
    tags: { kind: "v1-old-registry", resolver: "2017" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const resolver = yield* c.address("legacy.publicResolver2017");
        const name = yield* oldRegistryName({
          label: "relic",
          owner: c.accounts.alice,
          resolver,
        });
        yield* c.write(
          [resolver, "legacy/PublicResolver2017"],
          "setAddr",
          [name.node, c.accounts.alice],
          { from: c.accounts.alice },
        );
        return { ...name, owner: c.accounts.alice, resolver };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const node = namehash(String(facts["name"]));
        const owner = yield* c.read("v1.registry", "owner", [node]);
        yield* expectState("v1.old-registry", "owner via fallback", owner, c.accounts.alice);
        const exists = yield* c.read("v1.registry", "recordExists", [node]);
        yield* expectState("v1.old-registry", "record in current registry", exists, false);
      }),
  },
  {
    id: "v1.old-registry.migrated",
    cases: ["O02"],
    tags: { kind: "v1-unwrapped", state: "migrated-from-old-registry" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const resolver = yield* c.address("legacy.publicResolver2018");
        const name = yield* oldRegistryName({
          label: "moved",
          owner: c.accounts.alice,
          resolver,
        });
        // The first write on the current registry: its parent there re-creates the name.
        yield* c.write("v1.root", "setSubnodeOwner", [labelhash("test"), c.accounts.owner], {
          from: c.accounts.owner,
        });
        yield* c.write(
          "v1.registry",
          "setSubnodeOwner",
          [namehash("test"), labelhash("moved"), c.accounts.bob],
          { from: c.accounts.owner },
        );
        return {
          ...name,
          oldOwner: c.accounts.alice,
          owner: c.accounts.bob,
          oldResolver: resolver,
        };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const node = namehash(String(facts["name"]));
        const owner = yield* c.read("v1.registry", "owner", [node]);
        yield* expectState("v1.old-registry.migrated", "owner", owner, c.accounts.bob);
        const stale = yield* c.read("v1.legacyRegistry", "owner", [node]);
        yield* expectState(
          "v1.old-registry.migrated",
          "old registry owner",
          stale,
          c.accounts.alice,
        );
      }),
  },
];
