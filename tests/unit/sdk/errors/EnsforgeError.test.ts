import { afterEach, assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Schema } from "effect";

import { NameStateError, UnauthorizedError } from "@ensforge/sdk/internal/errors/classes/index";
import { getConfig, setConfig } from "@ensforge/sdk/internal/errors/config";
import { version } from "@ensforge/sdk/internal/version";

describe("EnsforgeError message", () => {
  it("renders summary, details, hint and the footer in order", () => {
    const contract = "0x00000000000000000000000000000000000000c3";
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
      Arr.join(
        [
          "Summary.",
          "First detail\nSecond detail",
          "Hint: Renew it.",
          Arr.join(
            [
              "Code: NAME_EXPIRED",
              "Operation: record.set",
              "Name: nick.eth",
              `Contract: ${contract}`,
              "Function: setText",
              "Docs: https://ensforge.com/docs/sdk/errors/NAME_EXPIRED",
              `Version: @ensforge/sdk@${version}`,
            ],
            "\n",
          ),
        ],
        "\n\n",
      ),
    );
  });

  it("omits empty blocks and unknown context lines", () => {
    const error = new NameStateError({ code: "NAME_LOCKED", shortMessage: "Locked." });

    assert.strictEqual(
      error.message,
      Arr.join(
        [
          "Locked.",
          Arr.join(
            [
              "Code: NAME_LOCKED",
              "Docs: https://ensforge.com/docs/sdk/errors/NAME_LOCKED",
              `Version: @ensforge/sdk@${version}`,
            ],
            "\n",
          ),
        ],
        "\n\n",
      ),
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

    assert.strictEqual(error.docsUrl, "https://docs.example/docs/sdk/errors/NOT_OWNER");
    assert.include(error.message, "Docs: https://docs.example/docs/sdk/errors/NOT_OWNER");
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
  it.effect("serializes the plain fields without the cause", () =>
    Effect.gen(function* () {
      const error = new NameStateError({
        code: "NAME_EXPIRED",
        hint: "Renew it.",
        context: { name: "a.eth" },
        cause: new Error("hidden"),
      });

      const json = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(error);
      const serialized = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(json);

      assert.deepStrictEqual(serialized, {
        name: "NameStateError",
        code: "NAME_EXPIRED",
        shortMessage: error.shortMessage,
        hint: "Renew it.",
        details: [],
        retryable: false,
        context: { name: "a.eth" },
        docsUrl: "https://ensforge.com/docs/sdk/errors/NAME_EXPIRED",
      });
    }),
  );
});
