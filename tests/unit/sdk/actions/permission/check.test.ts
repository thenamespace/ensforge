import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Roles } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";

import { clientFor, other, signer } from "../world.js";

describe("permission.check", () => {
  // contracts-v2 refuses a safe transfer while others hold the name's unemancipated roles
  // (TransferUnsafeWithMultipleAssignees), which `name.transfer` sends by default.
  it.effect("blocks an ENSv2 transfer while other accounts hold roles on the name", () =>
    Effect.gen(function* () {
      const [alone, shared] = yield* Effect.forEach([true, false], (onlyAssignee) =>
        Actions.permission.check(
          clientFor({
            name: "alice.eth",
            v2: { owner: signer, roles: Roles.registry.canTransferAdmin, onlyAssignee },
          }).ens,
          { name: "alice.eth", operation: "transfer", account: signer },
        ),
      );

      assert.isTrue(alone?.allowed);
      assert.isFalse(shared?.allowed);
      assert.deepStrictEqual(
        shared?.missing.map((requirement) => requirement.type === "blocked" && requirement.reason),
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

      const check = yield* Actions.permission.check(ens, {
        name: "alice.eth",
        operation: "transfer",
        account: other,
      });

      assert.isFalse(check.allowed);
    }),
  );

  // Regression: the coin key was parsed outside the Effect, so the Effect API died with a defect.
  it.effect("fails with a typed error for an address record key that is not a coin", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name: "alice.eth" });

      yield* expectFailure(
        Actions.permission.check(ens, {
          name: "alice.eth",
          operation: { setRecord: "address", key: "nope" },
          account: signer,
        }),
        { _tag: "InvalidInputError", code: "INVALID_COIN_TYPE" },
      );
    }),
  );
});

describe("permission.get", () => {
  it.effect("fails with a typed error for a record coin that does not exist", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ name: "alice.eth" });

      yield* expectFailure(
        Actions.permission.get(ens, {
          name: "alice.eth",
          account: signer,
          records: { addresses: ["nope"] },
        }),
        { _tag: "InvalidInputError", code: "INVALID_COIN_TYPE" },
      );
    }),
  );
});
