import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Roles } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk";

import { clientFor, other, signer } from "../world.js";

const transfer = (onlyAssignee: boolean) => {
  const { ens } = clientFor({
    name: "alice.eth",
    v2: { owner: signer, roles: Roles.registry.canTransferAdmin, onlyAssignee },
  });
  return Effect.promise(() =>
    Actions.permission.check(ens, { name: "alice.eth", operation: "transfer", account: signer }),
  );
};

describe("permission.check", () => {
  // contracts-v2 refuses a safe transfer while others hold the name's unemancipated roles
  // (TransferUnsafeWithMultipleAssignees), which `name.transfer` sends by default.
  it.effect("blocks an ENSv2 transfer while other accounts hold roles on the name", () =>
    Effect.gen(function* () {
      assert.isTrue((yield* transfer(true)).allowed);

      const shared = yield* transfer(false);
      assert.isFalse(shared.allowed);
      assert.deepStrictEqual(
        shared.missing.map((requirement) => requirement.type === "blocked" && requirement.reason),
        ["transfer-disallowed"],
      );
    }),
  );

  it.effect("still requires the owner for an ENSv2 transfer", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({
        name: "alice.eth",
        v2: { owner: signer, roles: Roles.registry.canTransferAdmin },
      });
      const check = yield* Effect.promise(() =>
        Actions.permission.check(ens, { name: "alice.eth", operation: "transfer", account: other }),
      );
      assert.isFalse(check.allowed);
    }),
  );
});
