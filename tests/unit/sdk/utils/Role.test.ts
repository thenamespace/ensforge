import { assert, describe, it } from "@effect/vitest";
import { Array, Record, Schema, String as Str } from "effect";

import { Roles } from "@ensforge/contracts";
import * as Role from "@ensforge/sdk/internal/utils/Role";
import { expectThrow } from "@ensforge/test-harness";

// Nybble indices from contracts-v2 v1.0.1 RegistryRolesLib and PermissionedResolverLib.
const registryNybbles = {
  registrar: 0n,
  registerReserved: 1n,
  setParent: 2n,
  unregister: 3n,
  renew: 4n,
  setSubregistry: 5n,
  setResolver: 6n,
  canTransfer: 7n,
  wasReserved: 8n,
  setUri: 9n,
  canName: 30n,
  upgrade: 31n,
} as const;
const resolverNybbles = {
  setAddr: 0n,
  setText: 1n,
  setContenthash: 2n,
  setAbi: 3n,
  setInterface: 4n,
  setName: 5n,
  setData: 6n,
  link: 7n,
  canName: 30n,
  upgrade: 31n,
} as const;

const registryNames: readonly Role.Name[] = Record.keys(Roles.registry);
const resolverNames: readonly Role.Name[] = Record.keys(Roles.resolver);

describe("Role bits", () => {
  it.each([...Record.toEntries(registryNybbles), ...Record.toEntries(resolverNybbles)])(
    "%s is nybble %s with its admin 128 bits higher",
    (name, nybble) => {
      assert.strictEqual(Role.from([name]), 1n << (4n * nybble));
      if (name === "wasReserved") return;
      assert.strictEqual(Role.from([Role.admin(name)]), 1n << (4n * nybble + 128n));
    },
  );

  it("covers every contract role", () => {
    assert.strictEqual(
      Role.from([...registryNames, ...resolverNames]) & ~Roles.enhancedAccessControl.allRoles,
      0n,
    );
    assert.sameMembers(
      Array.filter(registryNames, (name) => !Str.endsWith("Admin")(name)),
      Record.keys(registryNybbles),
    );
    assert.sameMembers(
      Array.filter(resolverNames, (name) => !Str.endsWith("Admin")(name)),
      Record.keys(resolverNybbles),
    );
  });
});

describe("Role.from and Role.has", () => {
  it.each([
    [[], 0n],
    [["setAddr", "setText"], 0x11n],
    [["setText", "setText"], 0x10n],
    [["renew", "renewAdmin"], (1n << 16n) | (1n << 144n)],
  ] as const)("builds %o as %s", (names, bitmap) => {
    assert.strictEqual(Role.from(names), bitmap);
  });

  it("checks one or several roles", () => {
    const bitmap = Role.from(["setAddr", "setText"]);

    assert.isTrue(Role.has(bitmap, "setAddr"));
    assert.isTrue(Role.has(bitmap, ["setAddr", "setText"]));
    assert.isTrue(Role.has(bitmap, []));
    assert.isFalse(Role.has(bitmap, ["setAddr", "setAbi"]));
    assert.isFalse(Role.has(0n, "setAddr"));
  });

  it.each(["", "nope", "setAddrAdminAdmin"])("rejects %j", (input) => {
    // The cast feeds an unknown role name on purpose.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const name = input as Role.Name;

    expectThrow(() => Role.from([name]), {
      _tag: "InvalidInputError",
      code: "INVALID_ROLES",
    });
    expectThrow(() => Role.has(0n, name), {
      _tag: "InvalidInputError",
      code: "INVALID_ROLES",
    });
  });
});

describe("Role.toNames", () => {
  it("names shared bit positions per target", () => {
    assert.deepStrictEqual(Role.toNames(1n << 28n, "registry"), ["canTransfer"]);
    assert.deepStrictEqual(Role.toNames(1n << 28n, "resolver"), ["link"]);
    assert.deepStrictEqual(Role.toNames(0n, "registry"), []);
  });

  it.prop(
    "inverts from for registry roles",
    [Schema.Array(Schema.Literals(registryNames))],
    ([names]) => {
      assert.sameMembers([...Role.toNames(Role.from(names), "registry")], [...new Set(names)]);
    },
  );

  it.prop(
    "inverts from for resolver roles",
    [Schema.Array(Schema.Literals(resolverNames))],
    ([names]) => {
      assert.sameMembers([...Role.toNames(Role.from(names), "resolver")], [...new Set(names)]);
    },
  );
});

describe("Role.admin", () => {
  it.each([
    ["setResolver", "setResolverAdmin"],
    ["setText", "setTextAdmin"],
  ] as const)("names the admin of %s", (name, expected) => {
    assert.strictEqual(Role.admin(name), expected);
  });
});
