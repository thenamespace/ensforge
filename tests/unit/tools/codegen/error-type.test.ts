import { assert, describe, it } from "@effect/vitest";

import type { Action } from "@ensforge/tools/internal/codegen/discover";
import { errorType, extensionProfile } from "@ensforge/tools/internal/codegen/render";

const action = (
  name: string,
  throws: readonly string[],
  options: Partial<Action> = {},
): Action => ({
  name,
  folder: "set",
  jsdoc: ["/**", " * Does it.", " *", ...throws.map((line) => ` * @throws ${line}`), " */"].join(
    "\n",
  ),
  properties: [],
  types: [],
  errorType: undefined,
  ...options,
});

describe("codegen ErrorType", () => {
  it("is the common errors plus the classes `@throws` names, once each", () => {
    const read = action("get", [
      "`Errors.InvalidInputError` (`INVALID_NAME`) for invalid input.",
      "`Errors.NotFoundError` or `Errors.InvalidInputError` when it is missing.",
      "`Errors.NetworkError` when the RPC request fails.",
    ]);

    assert.strictEqual(
      errorType(read, [read]),
      "Errors.CommonError | Errors.InvalidInputError | Errors.NotFoundError",
    );
  });

  it("is the write errors for a write and its Sync form", () => {
    const write = action("set", ["`Errors.UnauthorizedError` (`NOT_OWNER`) when not the owner."], {
      properties: ["prepare", "simulate", "estimateGas"],
    });
    const sync = action("setSync", ["`Errors.UnauthorizedError` when not the owner."]);

    assert.strictEqual(errorType(write, [write]), "Errors.WriteError | Errors.UnauthorizedError");
    assert.strictEqual(
      errorType(sync, [write, sync]),
      "Errors.WriteError | Errors.UnauthorizedError",
    );
    assert.strictEqual(
      errorType(sync, [sync]),
      "Errors.CommonError | Errors.UnauthorizedError",
      "without its write, a Sync name is a read",
    );
  });

  it("covers every SDK class with `Errors.AnyError`, keeping the package's own", () => {
    const send = action("send", [
      "`Errors.PlanError` (`PLAN_STALE`) when stale.",
      "`Errors.ContractRevertError`, or the step's own error (`Errors.AnyError`).",
      "`Errors.HcaError` when the account refuses.",
    ]);

    assert.strictEqual(errorType(send, [send], extensionProfile), "Errors.AnyError | HcaError");
  });
});
