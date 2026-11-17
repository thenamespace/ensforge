import { assert, describe, it } from "@effect/vitest";

import * as Classes from "@ensforge/sdk/internal/errors/classes/index";

import { codes, errorsByCode, retryableCodes } from "../codes";

const account = "0x00000000000000000000000000000000000000a1" as const;

describe("error class defaults", () => {
  it.each(codes)("%s has a summary, its tag as name, and its retry classification", (code) => {
    const error = errorsByCode[code]();

    assert.strictEqual(error.code, code);
    assert.strictEqual(error.name, error._tag);
    assert.strictEqual(error.constructor.name, error._tag);
    assert.isAbove(error.shortMessage.length, 0);
    assert.isTrue(error.message.startsWith(error.shortMessage));
    assert.strictEqual(error.retryable, retryableCodes.has(code));
  });

  it("explicit options override the code defaults", () => {
    const cause = new Error("boom");
    const error = new Classes.NameStateError({
      code: "NAME_EXPIRED",
      shortMessage: "custom",
      hint: "do this",
      details: ["line"],
      cause,
    });

    assert.include(error, { shortMessage: "custom", hint: "do this", cause });
    assert.deepStrictEqual(error.details, ["line"]);
  });

  it("undefined options never overwrite the code defaults", () => {
    const error = new Classes.CommitmentError({
      code: "COMMITMENT_TOO_OLD",
      shortMessage: undefined,
      hint: undefined,
    });

    assert.strictEqual(error.shortMessage, "The registration commitment has expired.");
    assert.strictEqual(error.hint, "Commit again, then register.");
  });
});

describe("error class copy that depends on options", () => {
  it.each([
    { readyAt: 100n, hint: "Register at or after unix time 100." },
    { readyAt: undefined, hint: "Wait for the minimum commitment age, then register." },
  ])("COMMITMENT_TOO_NEW hint with readyAt $readyAt", ({ readyAt, hint }) => {
    assert.strictEqual(
      new Classes.CommitmentError({ code: "COMMITMENT_TOO_NEW", readyAt }).hint,
      hint,
    );
  });

  it.each([
    { errorName: "Boom", shortMessage: "The contract call reverted with Boom." },
    { errorName: undefined, shortMessage: "The contract call reverted." },
  ])("ContractRevertError summary with errorName $errorName", ({ errorName, shortMessage }) => {
    const error = new Classes.ContractRevertError({ code: "CONTRACT_REVERTED", errorName });

    assert.strictEqual(error.shortMessage, shortMessage);
    assert.deepStrictEqual(error.args, []);
  });

  it.each([
    {
      options: { account, missingRoles: ["setResolver", "renew"] },
      shortMessage: `${account} is missing the roles this change needs.`,
      details: ["Missing roles: setResolver, renew"],
    },
    {
      options: { account: undefined, missingRoles: [] },
      shortMessage: "The account is missing the roles this change needs.",
      details: [],
    },
  ])(
    "MISSING_ROLES names the account and roles: $details",
    ({ options, shortMessage, details }) => {
      const error = new Classes.UnauthorizedError({ code: "MISSING_ROLES", ...options });

      assert.strictEqual(error.shortMessage, shortMessage);
      assert.deepStrictEqual(error.details, details);
    },
  );
});
