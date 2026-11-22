import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

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
});
