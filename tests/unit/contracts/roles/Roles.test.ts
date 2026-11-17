import { assert, describe, it } from "@effect/vitest";

import { Roles } from "@ensforge/contracts";

const { allRoles, adminRoles } = Roles.enhancedAccessControl;

const bitIndex = (role: bigint): number => role.toString(2).length - 1;

// EnhancedAccessControl packs each role into one nybble of the low 128 bits (a 4-bit assignee
// counter) and its admin role into the same nybble of the high 128 bits.
describe.each([
  ["registry", Roles.registry],
  ["resolver", Roles.resolver],
] as const)("Roles.%s", (_, roles) => {
  const entries = Object.entries(roles) as [string, bigint][];

  it("each role is a single nybble-aligned bit inside the EAC masks", () => {
    for (const [name, role] of entries) {
      assert.strictEqual(role & (role - 1n), 0n, `${name} is not a single bit`);
      assert.strictEqual(bitIndex(role) % 4, 0, `${name} is not nybble-aligned`);
      assert.strictEqual(role & allRoles, role, `${name} is outside allRoles`);
    }
  });

  it("roles are distinct", () => {
    const values = entries.map(([, role]) => role);
    assert.strictEqual(new Set(values).size, values.length);
  });

  it("every admin role is its role shifted by 128 bits, in the admin half", () => {
    for (const [name, admin] of entries.filter(([key]) => key.endsWith("Admin"))) {
      const role = roles[name.slice(0, -"Admin".length) as keyof typeof roles];
      assert.isDefined(role, `${name} has no base role`);
      assert.strictEqual(admin, role << 128n, name);
      assert.strictEqual(admin & adminRoles, admin, `${name} is outside adminRoles`);
    }
    for (const [name, role] of entries.filter(([key]) => !key.endsWith("Admin")))
      assert.strictEqual(role & adminRoles, 0n, `${name} is in the admin half`);
  });
});
