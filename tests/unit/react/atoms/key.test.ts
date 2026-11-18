import { assert, describe, it } from "@effect/vitest";
import { String as Str } from "effect";

import { optionsKey, readKey } from "@ensforge/react/internal/atoms/key";
import { bigname } from "@ensforge/sdk/indexer";

import { client } from "../fixtures.js";

describe("optionsKey", () => {
  it.each([
    ["field order", { name: "nick.eth", key: "url" }, { key: "url", name: "nick.eth" }],
    ["undefined fields", { name: "nick.eth", blockTag: undefined }, { name: "nick.eth" }],
    ["name case", { name: "Nick.ETH" }, { name: "nick.eth" }],
    ["names case", { names: ["Alice.eth", "bob.eth"] }, { names: ["alice.eth", "bob.eth"] }],
    ["parent case", { parent: "ENS.eth" }, { parent: "ens.eth" }],
    [
      "address case",
      { address: "0x00000000000000000000000000000000000A11CE" },
      { address: "0x00000000000000000000000000000000000a11ce" },
    ],
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
    // Regression: nested fields named `name` were normalized, so plans for other records shared one.
    [
      { name: "a.eth", texts: { name: "Alice" } },
      { name: "a.eth", texts: { name: "alice" } },
    ],
  ])("tells options apart (%#)", (left, right) => {
    assert.notStrictEqual(optionsKey(left), optionsKey(right));
  });

  it("keeps invalid names as typed, so the read fails on them", () => {
    assert.strictEqual(optionsKey({ name: "a..eth" }), '{"name":"a..eth"}');
  });
});

describe("readKey", () => {
  const action = Object.assign(() => undefined, { path: "record.getText" });

  it("names the chain, the action path and the options", () => {
    assert.strictEqual(
      readKey(client(), action, { name: "Nick.eth", key: "url" }),
      'ensforge:1:::record.getText:{"key":"url","name":"nick.eth"}',
    );
  });

  // Regression: reads were keyed by chain only, so a client of another account reused the
  // first account's answers.
  it("names the client's account and indexer, whatever the client object", () => {
    const account = "0xAbCdEf0123456789aBCdEf0123456789AbcDEF01";

    assert.strictEqual(
      readKey(client({ account, indexer: bigname() }), action, { name: "nick.eth", key: "url" }),
      `ensforge:1:${Str.toLowerCase(account)}:bigname:default:record.getText:{"key":"url","name":"nick.eth"}`,
    );
    // Two bigname deployments answer differently.
    assert.notStrictEqual(
      readKey(client({ indexer: bigname() }), action, { name: "nick.eth" }),
      readKey(client({ indexer: bigname({ url: "https://bigname.internal" }) }), action, {
        name: "nick.eth",
      }),
    );
    assert.strictEqual(
      readKey(client({ account }), action, { name: "nick.eth" }),
      readKey(client({ account }), action, { name: "nick.eth" }),
    );
  });
});
