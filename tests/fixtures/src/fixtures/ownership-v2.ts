import { Effect } from "effect";

import { Roles } from "@ensforge/contracts";
import type { StepContext } from "@ensforge/test-devnet";
import { maxUint64, zeroAddress, type Address } from "viem";

import { expectState } from "../builders/check.ts";
import { labelId } from "../builders/names.ts";
import { registerV1 } from "../builders/v1.ts";
import { mountUserRegistry, registerV2, v2Subname } from "../builders/v2.ts";
import type { Facts, Fixture } from "../fixture.ts";
import { days, durations } from "./durations.ts";

const { registry: role, enhancedAccessControl } = Roles;
const status = { available: 0, reserved: 1, registered: 2 } as const;

const fact = (facts: Facts, key: string) => String(facts[key]);
const ethRegistry = (c: StepContext) => c.address("v2.ethRegistry");
const read = <A>(
  c: StepContext,
  registry: Address,
  functionName: string,
  args: readonly unknown[],
) => c.read<A>([registry, "v2/ETHRegistry"], functionName, args);

/** A registered `label.eth` with a UserRegistry mounted under it, both held by `owner`. */
const parentWithRegistry = Effect.fnUntraced(function* (
  c: StepContext,
  label: string,
  owner: Address,
) {
  const parent = yield* registerV2(c, { label, owner, duration: durations.active });
  const registry = yield* mountUserRegistry(c, {
    parent: parent.name,
    parentRegistry: yield* ethRegistry(c),
    parentTokenId: parent.tokenId,
    owner,
  });
  return { ...parent, registry };
});

const lifecycle = (
  id: string,
  label: string,
  duration: bigint,
  expected: (typeof status)[keyof typeof status],
  cases: readonly string[],
  state: string,
): Fixture => ({
  id,
  cases,
  tags: { kind: "v2-native", state },
  v2: true,
  postlaunch: (c) =>
    registerV2(c, { label, owner: c.accounts.alice, duration }).pipe(
      Effect.map((name) => ({ ...name, owner: c.accounts.alice })),
    ),
  check: (c, facts) =>
    Effect.gen(function* () {
      const registry = yield* ethRegistry(c);
      const current = yield* read(c, registry, "getStatus", [labelId(label)]);
      yield* expectState(id, "status", current, expected);
      // Grace is the registrar's: the registry already reads AVAILABLE, the registrar refuses.
      if (state === "grace") {
        const available = yield* c.read("v2.ethRegistrar", "isAvailable", [label]);
        yield* expectState(id, "registrable", available, false);
      }
      // An expired name keeps its last owner as `latestOwnerOf`, and its token ID.
      const latest = yield* read(c, registry, "latestOwnerOf", [BigInt(fact(facts, "tokenId"))]);
      yield* expectState(id, "latest owner", latest, c.accounts.alice);
    }),
});

/** ENSv2 ownership: lifecycle, subregistries, roles and token regeneration, reservations. */
export const ownershipV2: readonly Fixture[] = [
  lifecycle(
    "v2.registered",
    "v2-plain",
    durations.active,
    status.registered,
    ["M:A14", "M:D1"],
    "registered",
  ),
  lifecycle(
    "v2.grace",
    "v2-grace",
    durations.v2Grace,
    status.available,
    ["M:A15", "T05", "T04"],
    "grace",
  ),
  lifecycle(
    "v2.expired",
    "v2-expired",
    durations.expired,
    status.available,
    ["M:A16", "O15", "W31", "W35"],
    "expired",
  ),
  {
    id: "v2.re-registered",
    cases: ["M:A17", "O17"],
    tags: { kind: "v2-native", state: "re-registered" },
    v2: true,
    postlaunch: (c) =>
      registerV2(c, {
        label: "v2-again",
        owner: c.accounts.alice,
        duration: durations.expired,
      }).pipe(
        Effect.map((name) => ({
          name: name.name,
          firstTokenId: name.tokenId,
          firstOwner: c.accounts.alice,
        })),
      ),
    afterTime: (c) =>
      registerV2(c, { label: "v2-again", owner: c.accounts.bob, duration: durations.active }).pipe(
        Effect.map((name) => ({ tokenId: name.tokenId, owner: c.accounts.bob })),
      ),
    check: (c, facts) =>
      Effect.gen(function* () {
        const registry = yield* ethRegistry(c);
        const owner = yield* read(c, registry, "findOwner", ["v2-again"]);
        yield* expectState("v2.re-registered", "owner", owner, c.accounts.bob);
        yield* expectState(
          "v2.re-registered",
          "new token",
          fact(facts, "tokenId") !== fact(facts, "firstTokenId"),
          true,
        );
        const old = yield* read(c, registry, "latestOwnerOf", [
          BigInt(fact(facts, "firstTokenId")),
        ]);
        yield* expectState("v2.re-registered", "old token dead", old, zeroAddress);
      }),
  },
  {
    id: "v2.subnames",
    cases: ["M:A18", "H24"],
    tags: { kind: "v2-native", state: "registered", depth: "3" },
    v2: true,
    postlaunch: (c) =>
      Effect.gen(function* () {
        const parent = yield* parentWithRegistry(c, "v2-parent", c.accounts.alice);
        const sub = yield* v2Subname(c, {
          registry: parent.registry,
          parent: parent.name,
          label: "sub",
          admin: c.accounts.alice,
          owner: c.accounts.alice,
          roles: enhancedAccessControl.allRoles,
          expiry: maxUint64,
        });
        const subRegistry = yield* mountUserRegistry(c, {
          parent: sub.name,
          parentRegistry: parent.registry,
          parentTokenId: sub.tokenId,
          owner: c.accounts.alice,
        });
        const deep = yield* v2Subname(c, {
          registry: subRegistry,
          parent: sub.name,
          label: "deep",
          admin: c.accounts.alice,
          owner: c.accounts.bob,
          roles: Roles.registryBitmaps.registration,
          expiry: c.time.now() + days(2n * 365n),
        });
        return {
          name: deep.name,
          owner: c.accounts.bob,
          registry: subRegistry,
          parentRegistry: parent.registry,
          tokenId: deep.tokenId,
        };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* read(c, fact(facts, "registry") as Address, "findOwner", ["deep"]);
        yield* expectState("v2.subnames", "owner", owner, c.accounts.bob);
      }),
  },
  ...(
    [
      ["v2.unregistered", "gone", ["M:A19", "O16"], "unregistered", status.available, false],
      ["v2.unregistered.renewed", "revived", ["O14"], "revived-reserved", status.reserved, true],
    ] as const
  ).map(([id, label, cases, state, expected, renew]): Fixture => ({
    id,
    cases,
    tags: { kind: "v2-native", state },
    v2: true,
    postlaunch: (c) =>
      Effect.gen(function* () {
        const parent = yield* parentWithRegistry(c, `v2-${label}-parent`, c.accounts.alice);
        const sub = yield* v2Subname(c, {
          registry: parent.registry,
          parent: parent.name,
          label,
          admin: c.accounts.alice,
          owner: c.accounts.bob,
          roles: Roles.registryBitmaps.registration,
          expiry: maxUint64,
        });
        const write = { from: c.accounts.alice } as const;
        yield* c.write(
          [parent.registry, "v2/UserRegistryImpl"],
          "unregister",
          [sub.tokenId],
          write,
        );
        // A root renewal revives an unregistered name, but only as RESERVED.
        if (renew) {
          yield* c.write(
            [parent.registry, "v2/UserRegistryImpl"],
            "renew",
            [sub.tokenId, durations.active + c.time.now()],
            write,
          );
        }
        return { name: sub.name, registry: parent.registry };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const current = yield* read(c, fact(facts, "registry") as Address, "getStatus", [
          labelId(label),
        ]);
        yield* expectState(id, "status", current, expected);
        const resolver = yield* read(c, fact(facts, "registry") as Address, "getResolver", [label]);
        yield* expectState(id, "resolver cleared", resolver, zeroAddress);
      }),
  })),
  {
    id: "v2.reserved.lapsed",
    cases: ["O13"],
    tags: { kind: "v2-native", state: "reserved-past-expiry" },
    v2: true,
    postlaunch: (c) =>
      Effect.gen(function* () {
        const parent = yield* parentWithRegistry(c, "v2-lapsed-parent", c.accounts.alice);
        yield* c.write(
          [parent.registry, "v2/UserRegistryImpl"],
          "register",
          ["held", zeroAddress, zeroAddress, zeroAddress, 0n, c.time.now() + days(1n)],
          { from: c.accounts.alice },
        );
        return { name: `held.${parent.name}`, registry: parent.registry };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const expiry = yield* read<bigint>(c, fact(facts, "registry") as Address, "findExpiry", [
          "held",
        ]);
        yield* expectState("v2.reserved.lapsed", "past expiry", expiry < c.time.now(), true);
        const current = yield* read(c, fact(facts, "registry") as Address, "getStatus", [
          labelId("held"),
        ]);
        yield* expectState("v2.reserved.lapsed", "status", current, status.available);
      }),
  },
  {
    id: "v2.roles",
    cases: ["M:A24", "M:D7", "W27"],
    tags: { kind: "v2-native", state: "registered", roles: "delegated" },
    v2: true,
    // Roles outside the regeneration set: the token keeps its ID.
    postlaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV2(c, {
          label: "v2-delegated",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        const registry = yield* ethRegistry(c);
        yield* c.write(
          [registry, "v2/ETHRegistry"],
          "grantRoles",
          [name.tokenId, role.setResolver, c.accounts.carol],
          {
            from: c.accounts.alice,
          },
        );
        const tokenId = yield* read<bigint>(c, registry, "findTokenId", ["v2-delegated"]);
        return { ...name, tokenId, delegate: c.accounts.carol };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const registry = yield* ethRegistry(c);
        const has = yield* read(c, registry, "hasRoles", [
          BigInt(fact(facts, "tokenId")),
          role.setResolver,
          c.accounts.carol,
        ]);
        yield* expectState("v2.roles", "carol can set the resolver", has, true);
      }),
  },
  {
    id: "v2.regenerated",
    cases: ["M:A25", "W24", "W25", "W36"],
    tags: { kind: "v2-native", state: "registered", token: "regenerated" },
    v2: true,
    postlaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV2(c, {
          label: "v2-regenerated",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        const registry = yield* ethRegistry(c);
        const resource = yield* read<bigint>(c, registry, "getResource", [name.tokenId]);
        // Granting a role in the regeneration set burns and re-mints the token under a new ID.
        yield* c.write(
          [registry, "v2/ETHRegistry"],
          "grantRoles",
          [name.tokenId, role.setSubregistry, c.accounts.carol],
          {
            from: c.accounts.alice,
          },
        );
        const tokenId = yield* read<bigint>(c, registry, "findTokenId", ["v2-regenerated"]);
        return { name: name.name, originalTokenId: name.tokenId, tokenId, resource };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const registry = yield* ethRegistry(c);
        yield* expectState(
          "v2.regenerated",
          "token regenerated",
          fact(facts, "tokenId") !== fact(facts, "originalTokenId"),
          true,
        );
        const resource = yield* read<bigint>(c, registry, "getResource", [
          BigInt(fact(facts, "tokenId")),
        ]);
        yield* expectState(
          "v2.regenerated",
          "resource stable",
          resource.toString(),
          fact(facts, "resource"),
        );
      }),
  },
  {
    id: "v2.operator",
    cases: ["W28", "M:D4"],
    tags: { kind: "v2-native", state: "registered", roles: "operator" },
    v2: true,
    postlaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV2(c, {
          label: "v2-operated",
          owner: c.accounts.carol,
          duration: durations.active,
        });
        yield* c.write(
          [yield* ethRegistry(c), "v2/ETHRegistry"],
          "setApprovalForAll",
          [c.accounts.operator, true],
          {
            from: c.accounts.carol,
          },
        );
        return { ...name, owner: c.accounts.carol, operator: c.accounts.operator };
      }),
    check: (c) =>
      Effect.gen(function* () {
        const approved = yield* read(c, yield* ethRegistry(c), "isApprovedForAll", [
          c.accounts.carol,
          c.accounts.operator,
        ]);
        yield* expectState("v2.operator", "operator", approved, true);
      }),
  },
  {
    id: "v2.reserved",
    cases: ["M:A23", "O18", "M:B8", "O30"],
    tags: { kind: "v2-reserved", state: "reserved" },
    v2: true,
    // Premigration (mainnet phase 2): an ENSv1 name reserved on ENSv2 until its v1 expiry plus
    // the premigration bonus, resolved through the ENSv1 bridge.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV1(c, {
          label: "v1-premigrated",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        const reservedUntil = name.expiry + 1n + days(62n);
        yield* c.write("v2.batchRegistrar", "batchRegister", [
          zeroAddress,
          yield* c.address("v2.ensV1Resolver"),
          ["v1-premigrated"],
          [reservedUntil],
        ]);
        return { ...name, owner: c.accounts.alice, reservedUntil };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const registry = yield* ethRegistry(c);
        const current = yield* read(c, registry, "getStatus", [labelId("v1-premigrated")]);
        yield* expectState("v2.reserved", "status", current, status.reserved);
        const resolver = yield* read(c, registry, "getResolver", ["v1-premigrated"]);
        yield* expectState(
          "v2.reserved",
          "bridge resolver",
          resolver,
          yield* c.address("v2.ensV1Resolver"),
        );
        const expiry = yield* read<bigint>(c, registry, "findExpiry", ["v1-premigrated"]);
        yield* expectState(
          "v2.reserved",
          "expiry",
          expiry.toString(),
          fact(facts, "reservedUntil"),
        );
      }),
  },
  {
    id: "v2.linked",
    cases: ["O20", "O21", "O22"],
    tags: { kind: "v2-native", state: "registered", registry: "linked" },
    v2: true,
    // One registry mounted under two names: `x.a.v2-link.eth` (canonical) and `x.alias.v2-link.eth`.
    postlaunch: (c) =>
      Effect.gen(function* () {
        const parent = yield* parentWithRegistry(c, "v2-link", c.accounts.alice);
        const a = yield* v2Subname(c, {
          registry: parent.registry,
          parent: parent.name,
          label: "a",
          admin: c.accounts.alice,
          owner: c.accounts.alice,
          roles: enhancedAccessControl.allRoles,
          expiry: maxUint64,
        });
        const shared = yield* mountUserRegistry(c, {
          parent: a.name,
          parentRegistry: parent.registry,
          parentTokenId: a.tokenId,
          owner: c.accounts.alice,
        });
        yield* v2Subname(c, {
          registry: parent.registry,
          parent: parent.name,
          label: "alias",
          admin: c.accounts.alice,
          owner: c.accounts.alice,
          roles: enhancedAccessControl.allRoles,
          expiry: maxUint64,
          subregistry: shared,
        });
        const child = yield* v2Subname(c, {
          registry: shared,
          parent: a.name,
          label: "x",
          admin: c.accounts.alice,
          owner: c.accounts.bob,
          roles: Roles.registryBitmaps.registration,
          expiry: maxUint64,
        });
        return { name: child.name, alias: `x.alias.${parent.name}`, registry: shared };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* read(c, fact(facts, "registry") as Address, "findOwner", ["x"]);
        yield* expectState("v2.linked", "owner", owner, c.accounts.bob);
      }),
  },
  {
    id: "v2.replaced-subregistry",
    cases: ["O23"],
    tags: { kind: "v2-native", state: "registered", registry: "replaced" },
    v2: true,
    // `old.v2-replaced.eth` lives in a registry the parent no longer mounts.
    postlaunch: (c) =>
      Effect.gen(function* () {
        const parent = yield* parentWithRegistry(c, "v2-replaced", c.accounts.alice);
        yield* v2Subname(c, {
          registry: parent.registry,
          parent: parent.name,
          label: "old",
          admin: c.accounts.alice,
          owner: c.accounts.bob,
          roles: Roles.registryBitmaps.registration,
          expiry: maxUint64,
        });
        const tokenId = yield* read<bigint>(c, yield* ethRegistry(c), "findTokenId", [
          "v2-replaced",
        ]);
        const replacement = yield* mountUserRegistry(c, {
          parent: parent.name,
          salt: `${parent.name}:replacement`,
          parentRegistry: yield* ethRegistry(c),
          parentTokenId: tokenId,
          owner: c.accounts.alice,
        });
        return {
          name: `old.${parent.name}`,
          staleRegistry: parent.registry,
          registry: replacement,
        };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const mounted = yield* read(c, yield* ethRegistry(c), "getSubregistry", ["v2-replaced"]);
        yield* expectState("v2.replaced-subregistry", "mounted", mounted, fact(facts, "registry"));
        const stale = yield* read(c, fact(facts, "staleRegistry") as Address, "findOwner", ["old"]);
        yield* expectState("v2.replaced-subregistry", "stale child", stale, c.accounts.bob);
      }),
  },
];
