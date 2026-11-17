import { assert, describe, it } from "@effect/vitest";

import { subjectsOf, writeSubjects } from "@ensforge/react/internal/atoms/subjects";
import type { Write } from "@ensforge/sdk";

const alice = "0x00000000000000000000000000000000000A11CE";
const bob = "0x0000000000000000000000000000000000000B0B";

describe("subjectsOf", () => {
  it.each([
    [{ name: "Nick.eth" }, { names: ["nick.eth"], addresses: [] }],
    [{ names: ["a.eth", "A.eth", "b.eth"] }, { names: ["a.eth", "b.eth"], addresses: [] }],
    [
      { parent: "ens.eth", owner: alice },
      { names: ["ens.eth"], addresses: [alice.toLowerCase()] },
    ],
    [
      { address: alice, account: { address: bob } },
      { names: [], addresses: [alice, bob].map((a) => a.toLowerCase()) },
    ],
    [
      { name: "a..eth", key: "url" },
      { names: [], addresses: [] },
    ],
    [undefined, { names: [], addresses: [] }],
  ])("reads %j", (options, expected) => {
    assert.deepStrictEqual(subjectsOf(options), expected);
  });
});

describe("writeSubjects", () => {
  it("adds parents, for subname and registry lists, and the signer", () => {
    const result = { plan: { account: bob } } as unknown as Write.Result;

    assert.deepStrictEqual(writeSubjects({ name: "pay.alice.eth", to: alice }, result), {
      names: ["pay.alice.eth", "alice.eth"],
      addresses: [alice.toLowerCase(), bob.toLowerCase()],
    });
  });

  it("lists a parent shared by several names once", () => {
    assert.deepStrictEqual(writeSubjects({ names: ["a.eth", "b.eth"] }, undefined), {
      names: ["a.eth", "b.eth", "eth"],
      addresses: [],
    });
  });
});
