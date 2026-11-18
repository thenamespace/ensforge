import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { Actions as Hca } from "@ensforge/hca";
import { Actions } from "@ensforge/sdk";
import { declaredErrors } from "@ensforge/test-harness/declared-errors";

import { actionsOf } from "./action-tree";

// The error-type check of the test lanes (`error-types.ts`) skips actions it finds no `ErrorType`
// for; every public action must have one.
describe("declared error types", () => {
  it("cover every public action, its Sync form and every HCA action", () => {
    const declared = declaredErrors();
    const paths = Arr.flatMap([Actions, Hca], (tree) =>
      Arr.map(actionsOf(tree), ({ path }) => path),
    );

    assert.isAbove(paths.length, 150);
    assert.deepStrictEqual(
      Arr.filter(paths, (path) => !declared.has(path)),
      [],
    );
  });

  it("expand the common and write errors into classes", () => {
    const declared = declaredErrors();

    assert.sameMembers(
      [...(declared.get("name.get") ?? [])],
      ["ConfigError", "ContractRevertError", "InternalError", "InvalidInputError", "NetworkError"],
    );
    assert.includeMembers(
      [...(declared.get("role.grantSync") ?? [])],
      ["UserRejectedError", "WalletError", "TransactionError", "UnauthorizedError"],
    );
    assert.includeMembers([...(declared.get("hca.execute") ?? [])], ["HcaError", "WalletError"]);
    assert.strictEqual(declared.get("plan.send")?.size, 19);
  });
});
