import { assert, describe, it } from "@effect/vitest";

import { Roles } from "@ensforge/contracts";
import { roleNames } from "@ensforge/sdk/internal/errors/translate/role-names";

describe("roleNames", () => {
  it.each([
    { kind: "registry", names: ["canTransfer"] },
    { kind: "resolver", names: ["link"] },
    { kind: "wrapper", names: [] },
    { kind: undefined, names: [] },
  ] as const)("names bit 28 for a $kind contract as $names", ({ kind, names }) => {
    // Bit 28 is `canTransfer` on registries and `link` on resolvers.
    assert.deepStrictEqual(roleNames(1n << 28n, kind), names);
  });

  it("names every role set in a registry bitmap", () => {
    const bitmap = Roles.registry.renew | Roles.registry.setResolverAdmin;

    assert.sameMembers([...roleNames(bitmap, "registry")], ["renew", "setResolverAdmin"]);
  });
});
