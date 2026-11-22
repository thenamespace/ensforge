import { assert, describe, it } from "@effect/vitest";

import { regeneratedTokenId } from "@ensforge/sdk/internal/internal/registry/delegates";

// PermissionedRegistry keeps a token's version in the low 32 bits of its ID and bumps it once per
// regenerating role change (`LibLabel.withVersion`).
describe("regeneratedTokenId", () => {
  const labelhash = 0xd779651c8b871550f6c5a6702390d55947573a8467107f2a5f72cf9a00000000n;

  it.each([
    [0, labelhash | 4n],
    [1, labelhash | 5n],
    [2, labelhash | 6n],
  ] as const)("predicts the ID after %s regenerations", (regenerations, expected) => {
    assert.strictEqual(regeneratedTokenId(labelhash | 4n, regenerations), expected);
  });

  it("wraps the version as a uint32, leaving the label bits alone", () => {
    assert.strictEqual(regeneratedTokenId(labelhash | 0xffffffffn, 1), labelhash);
  });
});
