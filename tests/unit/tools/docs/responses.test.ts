/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string, effecttsgo/global-date -- plain string and value checks in a unit test */
import { assert, describe, it } from "@effect/vitest";

import { callLine, literal } from "@ensforge/tools/internal/docs/literal";
import { exampleResponseSection, readable } from "@ensforge/tools/internal/docs/responses";

describe("readable", () => {
  it("writes bigints, bytes and dates readably and drops undefined", () => {
    assert.deepStrictEqual(
      readable({
        amount: 1_000n,
        bytes: new Uint8Array([1, 255]),
        at: new Date("2026-01-02T03:04:05.000Z"),
        list: [2n],
        missing: undefined,
        name: "nick.eth",
      }),
      {
        amount: "1000n",
        bytes: "0x01ff",
        at: "2026-01-02T03:04:05.000Z",
        list: ["2n"],
        name: "nick.eth",
      },
    );
  });
});

describe("callLine", () => {
  it("writes the call as a reader would", () => {
    assert.strictEqual(
      callLine("registration.getPrice", { name: "a.eth", duration: 31_536_000n, "x-y": [1] }),
      'await ens.registration.getPrice({ name: "a.eth", duration: 31_536_000n, "x-y": [1] })',
    );
    assert.strictEqual(literal({}), "{}");
  });
});

describe("exampleResponseSection", () => {
  it("renders the call, the date and the response as json", () => {
    const section = exampleResponseSection({
      call: 'await ens.record.getAddress({ name: "nick.eth" })',
      response: { address: "0xabc" },
      recordedAt: "2026-11-18T10:00:00.000Z",
      block: 42,
    });

    assert.include(section, "## Example response");
    assert.include(section, "Recorded from Ethereum mainnet on 2026-11-18 at block 42.");
    assert.include(section, '```ts\nawait ens.record.getAddress({ name: "nick.eth" })\n```');
    assert.include(section, '```json\n{\n  "address": "0xabc"\n}\n```');
  });
});
