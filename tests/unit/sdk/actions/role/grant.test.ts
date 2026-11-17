import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
import { labelhash } from "viem/ens";

import {
  clientFor,
  decodeCalls,
  other,
  resolverA,
  signer,
  v2Registry,
  type World,
} from "../world.js";

const name = "alice.eth";
const v2Name: World = { name, v2: { owner: signer, resolver: resolverA } };

describe("role.grant.prepare", () => {
  it.effect.each([
    [
      "a name's registry roles by label ID",
      { name, roles: ["renew"] },
      v2Registry,
      "grantRoles",
      [BigInt(labelhash("alice")), Roles.registry.renew, other],
    ],
    [
      "registry root roles",
      { name, root: true, roles: ["setResolver", "renew"] },
      v2Registry,
      "grantRootRoles",
      [Roles.registry.setResolver | Roles.registry.renew, other],
    ],
    [
      "PermissionedResolver root roles on the name's resolver",
      { name, root: true, target: "resolver", roles: 3n },
      resolverA,
      "grantRootRoles",
      [3n, other],
    ],
  ] as const)("grants %s", ([, options, to, functionName, args]) =>
    Effect.gen(function* () {
      const { ens } = clientFor(v2Name);

      const plan = yield* Actions.role.grant.prepare(ens, {
        target: "registry",
        grantee: other,
        ...options,
      });

      assert.deepStrictEqual(decodeCalls(plan.calls, Abis.v2.permissionedRegistry), [
        [to, functionName, args],
      ]);
      assert.deepStrictEqual(plan.warnings, []);
    }),
  );

  it.effect.each([["canTransfer"], ["setResolver"]] as const)(
    "warns that %s on a name regenerates its token ID",
    ([role]) =>
      Effect.gen(function* () {
        const { ens } = clientFor(v2Name);

        const plan = yield* Actions.role.grant.prepare(ens, {
          name,
          target: "registry",
          grantee: other,
          roles: [role],
        });

        assert.deepStrictEqual(
          plan.warnings.map((warning) => warning.code),
          ["TOKEN_ID_REGENERATED"],
        );
      }),
  );

  it.effect.each([
    [
      "registry roles on an ENSv1 name",
      { name, v1: { owner: signer } },
      { name, target: "registry" },
      "UnsupportedError",
      "UNSUPPORTED_PROTOCOL",
    ],
    [
      "per-name resolver roles",
      v2Name,
      { name, target: "resolver" },
      "InvalidInputError",
      "INVALID_RECORD_VALUE",
    ],
    [
      "neither a name nor root",
      v2Name,
      { target: "registry" },
      "InvalidInputError",
      "INVALID_RECORD_VALUE",
    ],
    [
      "an unknown role name",
      v2Name,
      { name, target: "registry", roles: ["fly"] },
      "InvalidInputError",
      undefined,
    ],
  ] as const)("rejects %s", ([, world, options, tag, code]) =>
    expectFailure(
      Actions.role.grant.prepare(clientFor(world).ens, {
        grantee: other,
        roles: ["setResolver"],
        ...(options as { target: "registry" }),
      }),
      { _tag: tag, code },
    ),
  );
});
