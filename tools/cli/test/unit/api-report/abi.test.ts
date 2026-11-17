import { assert, describe, it } from "@effect/vitest";

import { formatAbiItem, isAbi } from "../../../src/api-report/abi.ts";

describe("formatAbiItem", () => {
  it("prints nested tuples and tuple arrays as parenthesized types", () => {
    const item = {
      type: "function",
      name: "multicall",
      inputs: [
        {
          type: "tuple[]",
          components: [{ type: "address" }, { type: "tuple", components: [{ type: "bytes" }] }],
        },
      ],
      outputs: [{ type: "bytes[]" }],
      stateMutability: "view",
    };

    assert.strictEqual(
      formatAbiItem(item),
      "function multicall((address,(bytes))[]) view returns (bytes[])",
    );
  });

  it("omits nonpayable, empty outputs and a missing name", () => {
    assert.strictEqual(
      formatAbiItem({
        type: "function",
        name: "setText",
        inputs: [{ type: "string" }],
        outputs: [],
        stateMutability: "nonpayable",
      }),
      "function setText(string)",
    );
    assert.strictEqual(
      formatAbiItem({ type: "constructor", inputs: [{ type: "address" }] }),
      "constructor(address)",
    );
  });
});

describe("isAbi", () => {
  it("accepts a non-empty list of typed items only", () => {
    assert.isTrue(isAbi([{ type: "event", name: "Transfer" }]));
    assert.isFalse(isAbi([]));
    assert.isFalse(isAbi([{ name: "Transfer" }]));
    assert.isFalse(isAbi({ type: "event" }));
  });
});
