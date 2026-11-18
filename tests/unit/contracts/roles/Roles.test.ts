import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Record as Rec, String as Str } from "effect";

import { Roles } from "@ensforge/contracts";

const { allRoles, adminRoles } = Roles.enhancedAccessControl;

// EnhancedAccessControl packs each role into one nybble of the low 128 bits (a 4-bit assignee
// counter) and its admin role into the same nybble of the high 128 bits.
describe.each([
  ["registry", Roles.registry],
  ["resolver", Roles.resolver],
] as const)("Roles.%s", (_, roles) => {
  const roleByName: Readonly<Record<string, bigint>> = roles;
  const entries = Rec.toEntries(roleByName);

  it("each role is a single nybble-aligned bit inside the EAC masks", () => {
    for (const [name, role] of entries) {
      assert.strictEqual(role & (role - 1n), 0n, `${name} is not a single bit`);
      assert.strictEqual((role.toString(2).length - 1) % 4, 0, `${name} is not nybble-aligned`);
      assert.strictEqual(role & allRoles, role, `${name} is outside allRoles`);
    }
  });

  it("roles are distinct", () => {
    const values = Arr.map(entries, ([, role]) => role);
    assert.strictEqual(new Set(values).size, values.length);
  });

  it("every admin role is its role shifted by 128 bits, in the admin half", () => {
    for (const [name, admin] of Arr.filter(entries, ([key]) => Str.endsWith("Admin")(key))) {
      const baseName = Str.slice(0, -"Admin".length)(name);
      const role = roleByName[baseName];
      assert.isDefined(role, `${name} has no base role`);
      assert.strictEqual(admin, role << 128n, name);
      assert.strictEqual(admin & adminRoles, admin, `${name} is outside adminRoles`);
    }
    for (const [name, role] of Arr.filter(entries, ([key]) => !Str.endsWith("Admin")(key)))
      assert.strictEqual(role & adminRoles, 0n, `${name} is in the admin half`);
  });
});
