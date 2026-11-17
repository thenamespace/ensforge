import { assert, describe, it } from "@effect/vitest";

import { optionsKey, readKey } from "@ensforge/react/internal/atoms/key";

import { client } from "../fixtures.js";

describe("optionsKey", () => {
  it.each([
    ["field order", { name: "nick.eth", key: "url" }, { key: "url", name: "nick.eth" }],
    ["undefined fields", { name: "nick.eth", blockTag: undefined }, { name: "nick.eth" }],
    ["name case", { name: "Nick.ETH" }, { name: "nick.eth" }],
    ["names case", { names: ["Alice.eth", "bob.eth"] }, { names: ["alice.eth", "bob.eth"] }],
    [
      "signal and callbacks",
      { name: "a.eth", signal: new AbortController().signal, onStep: () => 1 },
      { name: "a.eth" },
    ],
  ])("ignores %s", (_, left, right) => {
    assert.strictEqual(optionsKey(left), optionsKey(right));
  });

  it.each([
    [{ duration: 1n }, { duration: 1 }],
    [{ name: "a.eth" }, { name: "b.eth" }],
    [{ names: ["a.eth", "b.eth"] }, { names: ["b.eth", "a.eth"] }],
  ])("tells options apart (%#)", (left, right) => {
    assert.notStrictEqual(optionsKey(left), optionsKey(right));
  });

  it("keeps invalid names as typed, so the read fails on them", () => {
    assert.strictEqual(optionsKey({ name: "a..eth" }), '{"name":"a..eth"}');
  });
});

describe("readKey", () => {
  it("names the chain, the action path and the options", () => {
    const action = Object.assign(() => undefined, { path: "record.getText" });

    assert.strictEqual(
      readKey(client(), action, { name: "Nick.eth", key: "url" }),
      'ensforge:1:record.getText:{"key":"url","name":"nick.eth"}',
    );
  });
});
