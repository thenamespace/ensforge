import { afterEach, assert, describe, it } from "@effect/vitest";

import { NameStateError, UnauthorizedError } from "@ensforge/sdk/internal/errors/classes/index";
import { getConfig, setConfig } from "@ensforge/sdk/internal/errors/config";
import { version } from "@ensforge/sdk/internal/version";

const contract = "0x00000000000000000000000000000000000000c3";

describe("EnsforgeError message", () => {
  it("renders summary, details, hint and the footer in order", () => {
    const error = new NameStateError({
      code: "NAME_EXPIRED",
      shortMessage: "Summary.",
      details: ["First detail", "Second detail"],
      hint: "Renew it.",
      context: {
        operation: "record.set",
        name: "nick.eth",
        contract,
        functionName: "setText",
      },
    });

    assert.strictEqual(
      error.message,
      [
        "Summary.",
        "First detail\nSecond detail",
        "Hint: Renew it.",
        [
          "Code: NAME_EXPIRED",
          "Operation: record.set",
          "Name: nick.eth",
          `Contract: ${contract}`,
          "Function: setText",
          "Docs: https://ensforge.com/errors/NAME_EXPIRED",
          `Version: @ensforge/sdk@${version}`,
        ].join("\n"),
      ].join("\n\n"),
    );
  });

  it("omits empty blocks and unknown context lines", () => {
    const error = new NameStateError({ code: "NAME_LOCKED", shortMessage: "Locked." });

    assert.strictEqual(
      error.message,
      [
        "Locked.",
        [
          "Code: NAME_LOCKED",
          "Docs: https://ensforge.com/errors/NAME_LOCKED",
          `Version: @ensforge/sdk@${version}`,
        ].join("\n"),
      ].join("\n\n"),
    );
  });
});

describe("EnsforgeError docs URL", () => {
  const original = getConfig();

  afterEach(() => {
    setConfig(original);
  });

  it("follows setConfig, keeping unspecified settings", () => {
    setConfig({ docsOrigin: "https://docs.example" });
    setConfig({});
    const error = new UnauthorizedError({ code: "NOT_OWNER" });

    assert.strictEqual(error.docsUrl, "https://docs.example/errors/NOT_OWNER");
    assert.include(error.message, "Docs: https://docs.example/errors/NOT_OWNER");
  });
});

describe("EnsforgeError.withContext", () => {
  it("adds missing fields without overwriting existing ones and re-renders", () => {
    const error = new NameStateError({ code: "NAME_EXPIRED", context: { name: "a.eth" } });
    const same = error.withContext({ name: "b.eth", operation: "name.renew" });

    assert.strictEqual(same, error);
    assert.deepStrictEqual(error.context, { name: "a.eth", operation: "name.renew" });
    assert.include(error.message, "Operation: name.renew");
    assert.include(error.message, "Name: a.eth");
  });

  it("ignores undefined", () => {
    const error = new NameStateError({ code: "NAME_EXPIRED", context: { name: "a.eth" } });

    assert.strictEqual(error.withContext(undefined), error);
    assert.deepStrictEqual(error.context, { name: "a.eth" });
  });
});

describe("EnsforgeError.withCause", () => {
  it("sets a cause only when there is none", () => {
    const first = new Error("first");
    const error = new NameStateError({ code: "NAME_EXPIRED" });

    assert.strictEqual(error.withCause(first), error);
    assert.strictEqual(error.withCause(new Error("second")).cause, first);
  });
});

describe("EnsforgeError.toJSON", () => {
  it("serializes the plain fields without the cause", () => {
    const error = new NameStateError({
      code: "NAME_EXPIRED",
      hint: "Renew it.",
      context: { name: "a.eth" },
      cause: new Error("hidden"),
    });

    assert.deepStrictEqual(JSON.parse(JSON.stringify(error)), {
      name: "NameStateError",
      code: "NAME_EXPIRED",
      shortMessage: error.shortMessage,
      hint: "Renew it.",
      details: [],
      retryable: false,
      context: { name: "a.eth" },
      docsUrl: "https://ensforge.com/errors/NAME_EXPIRED",
    });
  });
});
