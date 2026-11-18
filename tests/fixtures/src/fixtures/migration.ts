import { Effect } from "effect";

import { Roles } from "@ensforge/contracts";
import { nameWrapperFuses as fuse } from "@ensforge/contracts/v1";
import { CurrentStep, type StepContext } from "@ensforge/test-devnet";
import { encodeAbiParameters, hexToBigInt, zeroAddress, type Address } from "viem";

import { expectState } from "../builders/check.ts";
import { labelId } from "../builders/names.ts";
import { registerV1, wrappedSubname } from "../builders/v1.ts";
import { factAddress, type Fixture } from "../fixture.ts";
import { days, durations } from "./durations.ts";

/** `abi.encode(MigrationData(label, owner, subregistry, resolver))`, the controllers' input. */
const migrationData = (label: string, owner: Address, resolver: Address) =>
  encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "label", type: "string" },
          { name: "owner", type: "address" },
          { name: "subregistry", type: "address" },
          { name: "resolver", type: "address" },
        ],
      },
    ],
    [{ label, owner, subregistry: zeroAddress, resolver }],
  );

// Premigration (mainnet phase 2) reserves the name on ENSv2; migration then claims it.
const registerAndReserve = Effect.fnUntraced(function* (options: {
  readonly label: string;
  readonly wrapped?: boolean;
  readonly fuses?: number;
}) {
  const c = yield* CurrentStep;
  const name = yield* registerV1({
    label: options.label,
    owner: c.accounts.alice,
    duration: durations.active,
    ...(options.wrapped === true
      ? { controller: "wrapped" as const, fuses: options.fuses ?? 0 }
      : {}),
  });
  yield* c.write("v2.batchRegistrar", "batchRegister", [
    zeroAddress,
    yield* c.address("v2.ensV1Resolver"),
    [options.label],
    [name.expiry + 1n + days(62n)],
  ]);
  return name;
});

const checkMigrated = (id: string, label: string) => (c: StepContext) =>
  Effect.gen(function* () {
    const status = yield* c.read("v2.ethRegistry", "getStatus", [labelId(label)]);
    yield* expectState(id, "status", status, 2);
    const owner = yield* c.read("v2.ethRegistry", "findOwner", [label]);
    yield* expectState(id, "owner", owner, c.accounts.alice);
    // Migrated names carry the "was reserved" role.
    const tokenId = yield* c.read<bigint>("v2.ethRegistry", "findTokenId", [label]);
    const marked = yield* c.read("v2.ethRegistry", "hasRoles", [
      tokenId,
      Roles.registry.wasReserved,
      c.accounts.alice,
    ]);
    yield* expectState(id, "was reserved", marked, true);
  });

/** ENSv1 → ENSv2 migration: unwrapped, wrapped unlocked, locked, and a locked parent's child. */
export const migration: readonly Fixture[] = [
  {
    id: "migration.unwrapped",
    cases: ["M:A20", "O27", "M06"],
    tags: { kind: "v2-migrated", from: "v1-unwrapped" },
    v2: true,
    launched: true,
    sepolia: true,
    prelaunch: () => registerAndReserve({ label: "m-unwrapped" }),
    postlaunch: (c, facts) =>
      Effect.gen(function* () {
        yield* c.write(
          "v1.baseRegistrar",
          "safeTransferFrom",
          [
            c.accounts.alice,
            yield* c.address("v2.unlockedMigrationController"),
            labelId("m-unwrapped"),
            migrationData("m-unwrapped", c.accounts.alice, factAddress(facts, "resolver")),
          ],
          { from: c.accounts.alice },
        );
        return { owner: c.accounts.alice };
      }),
    check: checkMigrated("migration.unwrapped", "m-unwrapped"),
  },
  {
    id: "migration.wrapped-unlocked",
    cases: ["M:A21"],
    tags: { kind: "v2-migrated", from: "v1-wrapped-unlocked" },
    v2: true,
    launched: true,
    sepolia: true,
    prelaunch: () => registerAndReserve({ label: "m-wrapped", wrapped: true }),
    postlaunch: (c, facts) =>
      Effect.gen(function* () {
        yield* c.write(
          "v1.nameWrapper",
          "safeTransferFrom",
          [
            c.accounts.alice,
            yield* c.address("v2.unlockedMigrationController"),
            BigInt(String(facts["node"])),
            1n,
            migrationData("m-wrapped", c.accounts.alice, factAddress(facts, "resolver")),
          ],
          { from: c.accounts.alice },
        );
        return { owner: c.accounts.alice };
      }),
    check: checkMigrated("migration.wrapped-unlocked", "m-wrapped"),
  },
  {
    id: "migration.locked",
    cases: ["M:A22", "M07", "W38", "O28", "M09"],
    tags: { kind: "v2-migrated", from: "v1-locked" },
    v2: true,
    launched: true,
    // Sepolia's builds initialize the WrapperRegistry explicitly and grant a renew role.
    sepolia: true,
    // A locked parent with a locked, still unmigrated child: after migration the child keeps
    // resolving through ENSv1 under the parent's new WrapperRegistry.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerAndReserve({
          label: "m-locked",
          wrapped: true,
          fuses: fuse.cannotUnwrap | fuse.cannotSetResolver,
        });
        const [, , expiry] = yield* c.read<readonly [Address, number, bigint]>(
          "v1.nameWrapper",
          "getData",
          [hexToBigInt(name.node)],
        );
        const child = yield* wrappedSubname({
          parent: name.name,
          label: "child",
          parentOwner: c.accounts.alice,
          owner: c.accounts.bob,
          fuses: fuse.parentCannotControl | fuse.cannotUnwrap,
          expiry,
        });
        return { ...name, child: child.name };
      }),
    postlaunch: (c, facts) =>
      Effect.gen(function* () {
        yield* c.write(
          "v1.nameWrapper",
          "safeTransferFrom",
          [
            c.accounts.alice,
            yield* c.address("v2.lockedMigrationController"),
            BigInt(String(facts["node"])),
            1n,
            migrationData("m-locked", c.accounts.alice, factAddress(facts, "resolver")),
          ],
          { from: c.accounts.alice },
        );
        const subregistry = yield* c.read<Address>("v2.ethRegistry", "getSubregistry", [
          "m-locked",
        ]);
        return { owner: c.accounts.alice, wrapperRegistry: subregistry };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        yield* checkMigrated("migration.locked", "m-locked")(c);
        yield* expectState(
          "migration.locked",
          "wrapper registry mounted",
          facts["wrapperRegistry"] !== zeroAddress,
          true,
        );
      }),
  },
];
