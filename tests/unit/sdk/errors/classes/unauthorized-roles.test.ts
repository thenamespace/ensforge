import { assert, describe, it } from "@effect/vitest";

import { Roles } from "@ensforge/contracts";
import { UnauthorizedError } from "@ensforge/sdk/internal/errors/classes/index";

describe("UnauthorizedError role names", () => {
  // Simulation translates a revert before the write action knows which contract kind it hit.
  it("decodes the missing roles once context names the contract kind", () => {
    const error = new UnauthorizedError({
      code: "MISSING_ROLES",
      roleBitmap: Roles.resolver.setText,
    }).withContext({ contractKind: "resolver" });

    assert.deepStrictEqual(error.missingRoles, ["setText"]);
    assert.include(error.message, "Missing roles: setText");
  });
});
