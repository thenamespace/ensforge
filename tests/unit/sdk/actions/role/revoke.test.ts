import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";

import { clientFor, decodeCalls, other, resolverA, signer, v2Registry } from "../world.js";

const name = "alice.eth";
const world = { name, v2: { owner: signer, resolver: resolverA }, permissioned: [resolverA] };

describe("role.revoke.prepare", () => {
  // `registrar` and `setAddr` are both bit 0: the name is read from the target's table.
  it.effect("revokes registry roles by their registry names", () =>
    Effect.gen(function* () {
      const plan = yield* Actions.role.revoke.prepare(clientFor(world).ens, {
        name,
        root: true,
        target: "registry",
        holder: other,
        roles: ["registrar"],
      });

      assert.deepStrictEqual(decodeCalls(plan.calls, Abis.v2.permissionedRegistry), [
        [v2Registry, "revokeRootRoles", [Roles.registry.registrar, other]],
      ]);
    }),
  );

  it.effect.each([
    [
      "a resolver role name for a registry",
      { target: "registry", roles: ["setAddr"] },
      "INVALID_ROLES",
    ],
    [
      "a resolver given as the registry",
      { target: "registry", roles: ["renew"], contract: resolverA },
      "INVALID_ADDRESS",
    ],
  ] as const)("rejects %s", ([, options, code]) =>
    expectFailure(
      Actions.role.revoke.prepare(clientFor(world).ens, {
        name,
        root: true,
        holder: other,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the cases include inputs the types reject
        ...(options as { target: "registry"; roles: readonly ["renew"] }),
      }),
      { _tag: "InvalidInputError", code },
    ),
  );

  // The registry checks `canTransferAdmin` on the owner's token before every transfer, and admin
  // roles can never be granted on a token again.
  it.effect("refuses to freeze the owner's name unless asked to", () =>
    Effect.gen(function* () {
      const owned = {
        name,
        v2: { owner: signer, resolver: resolverA, roles: Roles.registry.canTransferAdmin },
      };
      const options = {
        name,
        target: "registry",
        holder: signer,
        roles: ["canTransferAdmin"],
      } as const;

      yield* expectFailure(Actions.role.revoke.prepare(clientFor(owned).ens, options), {
        _tag: "InvalidInputError",
        code: "INVALID_ROLES",
      });
      const plan = yield* Actions.role.revoke.prepare(clientFor(owned).ens, {
        ...options,
        allowIrreversible: true,
      });
      assert.strictEqual(plan.calls.length, 1);
    }),
  );

  it.effect.each([
    // setResolverAdmin also regenerates the token ID.
    [
      "the last holder, with nobody at the root",
      0n,
      ["TOKEN_ID_REGENERATED", "ROLE_ADMIN_LOCKOUT"],
    ],
    [
      "the last holder, with a root holder",
      Roles.registry.setResolverAdmin,
      ["TOKEN_ID_REGENERATED"],
    ],
  ] as const)("warns when revoking an admin role from %s", ([, root, codes]) =>
    Effect.gen(function* () {
      const lastAdmin = {
        name,
        v2: { owner: signer, resolver: resolverA, roles: Roles.registry.setResolverAdmin },
        assignees: { "0": root, "1": Roles.registry.setResolverAdmin },
      };

      const plan = yield* Actions.role.revoke.prepare(clientFor(lastAdmin).ens, {
        name,
        target: "registry",
        holder: signer,
        roles: ["setResolverAdmin"],
      });

      assert.deepStrictEqual<readonly string[]>(
        Arr.map(plan.warnings, (warning) => warning.code),
        codes,
      );
    }),
  );
});
