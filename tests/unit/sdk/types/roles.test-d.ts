import { describe, expectTypeOf, it } from "@effect/vitest";

import { Role, type Actions } from "@ensforge/sdk";

type GrantOptions = Parameters<typeof Actions.role.grant>[1];

// Registry and resolver roles share bit positions, so each target accepts only its own names.
describe("role names per target", () => {
  it("grants accept only the target's role names", () => {
    expectTypeOf<{
      target: "registry";
      grantee: string;
      roles: ["registrar"];
    }>().toExtend<GrantOptions>();
    expectTypeOf<{
      target: "resolver";
      grantee: string;
      roles: ["setText"];
    }>().toExtend<GrantOptions>();
    expectTypeOf<{
      target: "registry";
      grantee: string;
      roles: ["setAddr"];
    }>().not.toExtend<GrantOptions>();
    expectTypeOf<{
      target: "resolver";
      grantee: string;
      roles: ["registrar"];
    }>().not.toExtend<GrantOptions>();
  });

  it("Role.from narrows names to the target's table", () => {
    expectTypeOf(Role.from<"registry">)
      .parameter(0)
      .toEqualTypeOf<readonly Role.RegistryName[]>();
    // @ts-expect-error -- `setAddr` is a resolver role
    Role.from(["setAddr"], "registry");
  });
});
