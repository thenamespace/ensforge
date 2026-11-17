import { Effect } from "effect";

import { nameWrapperFuses as fuse } from "@ensforge/contracts/v1";
import type { StepContext } from "@ensforge/test-devnet";
import { hexToBigInt, labelhash, namehash, type Address } from "viem";

import { expectState } from "../builders/check.ts";
import { labelId } from "../builders/names.ts";
import { registerV1, v1Subname, wrapName, wrappedSubname } from "../builders/v1.ts";
import type { Facts, Fixture } from "../fixture.ts";
import { days, durations } from "./durations.ts";

const getData = (c: StepContext, name: string) =>
  c
    .read<readonly [Address, number, bigint]>("v1.nameWrapper", "getData", [
      hexToBigInt(namehash(name)),
    ])
    .pipe(Effect.map(([owner, fuses, expiry]) => ({ owner, fuses, expiry })));

// The NameWrapper adds these to every wrapped `.eth` second-level name.
const eth2ldFuses = fuse.parentCannotControl | fuse.isDotEth;

const wrappedEth = (
  id: string,
  label: string,
  ownerFuses: number,
  cases: readonly string[],
  tags: Record<string, string>,
): Fixture => ({
  id,
  cases,
  tags: { kind: "v1-wrapped", state: "registered", ...tags },
  prelaunch: (c) =>
    Effect.gen(function* () {
      const name = yield* registerV1(c, {
        label,
        owner: c.accounts.alice,
        duration: durations.active,
        controller: "wrapped",
        fuses: ownerFuses,
      });
      // The wrapper's own expiry: the registrar's plus the 90-day grace period.
      const data = yield* getData(c, name.name);
      return { ...name, wrapperExpiry: data.expiry };
    }),
  check: (c, facts) =>
    Effect.gen(function* () {
      const data = yield* getData(c, String(facts["name"]));
      yield* expectState(id, "owner", data.owner, c.accounts.alice);
      yield* expectState(id, "fuses", data.fuses, ownerFuses | eth2ldFuses);
    }),
});

const locked = fuse.cannotUnwrap;

// A locked parent for wrapped subnames: children can be emancipated only under a locked parent.
const parent = "w-parent.eth";
const parentFixture: Fixture = {
  ...wrappedEth("v1.wrapped.locked", "w-parent", locked, ["M:A8"], { fuses: "CU" }),
};

const subname = (
  id: string,
  label: string,
  childFuses: number,
  expiry: "parent" | "short",
  cases: readonly string[],
  tags: Record<string, string>,
): Fixture => ({
  id,
  cases,
  tags: { kind: "v1-wrapped", ...tags },
  prelaunch: (c) =>
    Effect.gen(function* () {
      const parentData = yield* getData(c, parent);
      const sub = yield* wrappedSubname(c, {
        parent,
        label,
        parentOwner: c.accounts.alice,
        owner: c.accounts.bob,
        fuses: childFuses,
        // A short expiry passes during the build's clock jump while the parent stays registered.
        expiry: expiry === "parent" ? parentData.expiry : c.time.now() + days(1n),
      });
      const data = yield* getData(c, sub.name);
      return {
        name: sub.name,
        parent,
        owner: c.accounts.bob,
        fuses: data.fuses,
        expiry: data.expiry,
      };
    }),
  check: (c, facts) =>
    Effect.gen(function* () {
      const data = yield* getData(c, String(facts["name"]));
      const expired = data.expiry < c.time.now();
      yield* expectState(id, "expired", expired, expiry === "short");
      // Expiry clears an emancipated name's owner; a parent-controlled one keeps it (W09).
      const ownerCleared = expired && (childFuses & fuse.parentCannotControl) !== 0;
      yield* expectState(
        id,
        "owner",
        data.owner,
        ownerCleared ? fuseOwnerWhenExpired : c.accounts.bob,
      );
      yield* expectState(id, "fuses", data.fuses, expired ? 0 : childFuses);
    }),
});

const fuseOwnerWhenExpired = "0x0000000000000000000000000000000000000000";

/** The NameWrapper's states: fuses, subnames, approvals, expiry and desync, mixed trees. */
export const wrapper: readonly Fixture[] = [
  wrappedEth("v1.wrapped", "w-plain", 0, ["M:A7", "W16", "T03"], { fuses: "none" }),
  parentFixture,
  ...(
    [
      ["cannot-transfer", fuse.cannotTransfer, "CT", ["M:A8", "M08", "W30"]],
      ["cannot-set-resolver", fuse.cannotSetResolver, "CSR", ["M:A8", "M07"]],
      ["cannot-set-ttl", fuse.cannotSetTtl, "CST", ["M:A8"]],
      ["cannot-create-subdomain", fuse.cannotCreateSubdomain, "CCS", ["M:A8", "W38"]],
      ["cannot-burn-fuses", fuse.cannotBurnFuses, "CBF", ["M:A8", "W38"]],
      [
        "all",
        fuse.cannotBurnFuses |
          fuse.cannotTransfer |
          fuse.cannotSetResolver |
          fuse.cannotSetTtl |
          fuse.cannotCreateSubdomain |
          fuse.cannotApprove,
        "all",
        ["M:A8"],
      ],
    ] as const
  ).map(([suffix, extra, tag, cases]) =>
    wrappedEth(`v1.wrapped.locked.${suffix}`, `w-${suffix}`, locked | extra, cases, {
      fuses: `CU+${tag}`,
    }),
  ),
  {
    id: "v1.wrapped.approved",
    cases: ["W12", "W13", "M:D5"],
    tags: { kind: "v1-wrapped", state: "registered", approval: "token-approved" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV1(c, {
          label: "w-approved",
          owner: c.accounts.alice,
          duration: durations.active,
          controller: "wrapped",
        });
        yield* c.write("v1.nameWrapper", "approve", [c.accounts.approved, hexToBigInt(name.node)], {
          from: c.accounts.alice,
        });
        return { ...name, approved: c.accounts.approved };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const approved = yield* c.read("v1.nameWrapper", "getApproved", [
          hexToBigInt(namehash(String(facts["name"]))),
        ]);
        yield* expectState("v1.wrapped.approved", "approved", approved, c.accounts.approved);
      }),
  },
  {
    id: "v1.wrapped.locked.cannot-approve",
    cases: ["W11", "M:A8"],
    tags: { kind: "v1-wrapped", state: "registered", fuses: "CU+CA", approval: "frozen" },
    // The approval is set first, then frozen by burning CANNOT_APPROVE.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV1(c, {
          label: "w-frozen-approval",
          owner: c.accounts.alice,
          duration: durations.active,
          controller: "wrapped",
          fuses: locked,
        });
        yield* c.write("v1.nameWrapper", "approve", [c.accounts.approved, hexToBigInt(name.node)], {
          from: c.accounts.alice,
        });
        yield* c.write("v1.nameWrapper", "setFuses", [name.node, fuse.cannotApprove], {
          from: c.accounts.alice,
        });
        return { ...name, approved: c.accounts.approved };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const node = hexToBigInt(namehash(String(facts["name"])));
        const approved = yield* c.read("v1.nameWrapper", "getApproved", [node]);
        yield* expectState(
          "v1.wrapped.locked.cannot-approve",
          "approved",
          approved,
          c.accounts.approved,
        );
        const data = yield* getData(c, String(facts["name"]));
        yield* expectState(
          "v1.wrapped.locked.cannot-approve",
          "fuses",
          data.fuses,
          locked | fuse.cannotApprove | eth2ldFuses,
        );
      }),
  },
  subname("v1.wrapped.sub", "controlled", 0, "parent", ["M:A9", "O10", "M:D8", "A07"], {
    state: "registered",
    sub: "parent-controlled",
  }),
  subname(
    "v1.wrapped.sub.emancipated",
    "emancipated",
    fuse.parentCannotControl,
    "parent",
    ["M:A10", "A08", "W06"],
    {
      state: "registered",
      sub: "emancipated",
    },
  ),
  subname(
    "v1.wrapped.sub.locked",
    "locked",
    fuse.parentCannotControl | fuse.cannotUnwrap,
    "parent",
    ["M:A11", "W03", "W04"],
    { state: "registered", sub: "locked" },
  ),
  subname(
    "v1.wrapped.sub.can-extend",
    "extendable",
    fuse.parentCannotControl | fuse.cannotUnwrap | fuse.canExtendExpiry,
    "parent",
    ["W14", "W38"],
    { state: "registered", sub: "can-extend-expiry" },
  ),
  subname(
    "v1.wrapped.sub.expired-emancipated",
    "lapsed",
    fuse.parentCannotControl,
    "short",
    ["W05", "W01", "W10"],
    {
      state: "expired",
      sub: "emancipated",
    },
  ),
  subname("v1.wrapped.sub.expired", "stale", 0, "short", ["W09", "M:A12"], {
    state: "expired",
    sub: "parent-controlled",
  }),
  {
    id: "v1.wrapped.grace",
    cases: ["M:A13", "W07"],
    tags: { kind: "v1-wrapped", state: "grace" },
    prelaunch: (c) =>
      registerV1(c, {
        label: "w-grace",
        owner: c.accounts.alice,
        duration: durations.v1Grace,
        controller: "wrapped",
      }),
    // In the registrar's grace period the wrapper token still exists (wrapper expiry = + 90 days).
    check: (c, facts) =>
      Effect.gen(function* () {
        const data = yield* getData(c, String(facts["name"]));
        yield* expectState("v1.wrapped.grace", "wrapper owner", data.owner, c.accounts.alice);
        const registrarExpiry = yield* c.read<bigint>("v1.baseRegistrar", "nameExpires", [
          labelId("w-grace"),
        ]);
        yield* expectState(
          "v1.wrapped.grace",
          "registrar expired",
          registrarExpiry < c.time.now(),
          true,
        );
      }),
  },
  {
    id: "v1.wrapped.expired",
    cases: ["W08", "W21"],
    tags: { kind: "v1-wrapped", state: "expired" },
    prelaunch: (c) =>
      registerV1(c, {
        label: "w-expired",
        owner: c.accounts.alice,
        duration: durations.expired,
        controller: "wrapped",
        fuses: locked | fuse.cannotTransfer,
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const data = yield* getData(c, String(facts["name"]));
        yield* expectState("v1.wrapped.expired", "owner", data.owner, fuseOwnerWhenExpired);
        yield* expectState("v1.wrapped.expired", "fuses", data.fuses, 0);
      }),
  },
  {
    id: "v1.wrapped.desynced",
    cases: ["O07", "O08"],
    tags: { kind: "v1-wrapped", state: "desynced" },
    // Renewed through the 2020 controller, which extends the registrar but not the wrapper.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV1(c, {
          label: "w-desynced",
          owner: c.accounts.alice,
          duration: durations.expired,
          controller: "wrapped",
        });
        const price = yield* c.read<bigint>("v1.legacyEthRegistrarController", "rentPrice", [
          "w-desynced",
          durations.active,
        ]);
        yield* c.write(
          "v1.legacyEthRegistrarController",
          "renew",
          ["w-desynced", durations.active],
          {
            from: c.accounts.alice,
            value: price * 2n,
          },
        );
        const registrarExpiry = yield* c.read<bigint>("v1.baseRegistrar", "nameExpires", [
          labelId("w-desynced"),
        ]);
        const data = yield* getData(c, name.name);
        return { name: name.name, registrarExpiry, wrapperExpiry: data.expiry };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const registrarExpiry = BigInt(String(facts["registrarExpiry"]));
        const wrapperExpiry = BigInt(String(facts["wrapperExpiry"]));
        yield* expectState(
          "v1.wrapped.desynced",
          "desynced",
          wrapperExpiry < registrarExpiry,
          true,
        );
        // The wrapper reads expired while the registrar registration is live.
        const now = c.time.now();
        yield* expectState("v1.wrapped.desynced", "wrapper expired", wrapperExpiry < now, true);
        yield* expectState("v1.wrapped.desynced", "registrar live", registrarExpiry > now, true);
      }),
  },
  {
    id: "v1.wrapped.sub.unwrapped-parent",
    cases: ["O10", "O09"],
    tags: { kind: "v1-wrapped", state: "registered", parent: "unwrapped" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const parentName = yield* registerV1(c, {
          label: "w-loose-parent",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        const sub = yield* v1Subname(c, {
          parent: parentName.name,
          label: "wrapped",
          parentOwner: c.accounts.alice,
          owner: c.accounts.bob,
        });
        yield* wrapName(c, { name: sub.name, owner: c.accounts.bob });
        return { name: sub.name, parent: parentName.name, owner: c.accounts.bob };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const data = yield* getData(c, String(facts["name"]));
        yield* expectState(
          "v1.wrapped.sub.unwrapped-parent",
          "wrapper owner",
          data.owner,
          c.accounts.bob,
        );
        const registryOwner = yield* c.read("v1.registry", "owner", [
          namehash(String(facts["name"])),
        ]);
        yield* expectState(
          "v1.wrapped.sub.unwrapped-parent",
          "registry owner",
          registryOwner,
          yield* c.address("v1.nameWrapper"),
        );
      }),
  },
  {
    id: "v1.unwrapped.sub.wrapped-parent",
    cases: ["O11"],
    tags: { kind: "v1-unwrapped", state: "registered", parent: "wrapped" },
    // Created wrapped under a wrapped parent, then unwrapped by its owner.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const parentName = yield* registerV1(c, {
          label: "w-tight-parent",
          owner: c.accounts.alice,
          duration: durations.active,
          controller: "wrapped",
        });
        const parentData = yield* getData(c, parentName.name);
        const sub = yield* wrappedSubname(c, {
          parent: parentName.name,
          label: "plain",
          parentOwner: c.accounts.alice,
          owner: c.accounts.bob,
          fuses: 0,
          expiry: parentData.expiry,
        });
        yield* c.write(
          "v1.nameWrapper",
          "unwrap",
          [parentName.node, labelhash("plain"), c.accounts.bob],
          { from: c.accounts.bob },
        );
        return { name: sub.name, parent: parentName.name, owner: c.accounts.bob };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* c.read("v1.registry", "owner", [namehash(String(facts["name"]))]);
        yield* expectState(
          "v1.unwrapped.sub.wrapped-parent",
          "registry owner",
          owner,
          c.accounts.bob,
        );
      }),
  },
  {
    id: "v1.wrapped.implicit-unwrap",
    cases: ["O06", "M:A12"],
    tags: { kind: "v1-unwrapped", state: "re-registered-over-wrapper" },
    // Needs ENSv1 registration after the wrapped name lapsed: only before the ENSv2 launch.
    unlaunched: true,
    prelaunch: (c) =>
      registerV1(c, {
        label: "w-reclaimed",
        owner: c.accounts.alice,
        duration: durations.expired,
        controller: "wrapped",
      }),
    afterTime: (c) =>
      registerV1(c, {
        label: "w-reclaimed",
        owner: c.accounts.bob,
        duration: durations.active,
      }).pipe(
        Effect.map((name) => ({
          ...name,
          owner: c.accounts.bob,
          staleWrapperOwner: c.accounts.alice,
        })),
      ),
    check: (c, facts: Facts) =>
      Effect.gen(function* () {
        const registrant = yield* c.read("v1.baseRegistrar", "ownerOf", [labelId("w-reclaimed")]);
        yield* expectState("v1.wrapped.implicit-unwrap", "registrant", registrant, c.accounts.bob);
        const owner = yield* c.read("v1.registry", "owner", [namehash(String(facts["name"]))]);
        yield* expectState("v1.wrapped.implicit-unwrap", "registry owner", owner, c.accounts.bob);
      }),
  },
];
