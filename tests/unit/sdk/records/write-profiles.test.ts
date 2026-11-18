import { assert, describe, it } from "@effect/vitest";

import { writtenProfiles } from "@ensforge/sdk/internal/internal/records/write-profiles";
import { zeroAddress } from "viem";

describe("writtenProfiles", () => {
  it("names the ERC-165 profile of every kind of record written, deletions included", () => {
    const profiles = writtenProfiles({
      texts: { url: null },
      addresses: { btc: "bc1q" },
      contentHash: null,
      abi: { value: null },
      pubkey: null,
      nameRecord: "nick.eth",
      interfaces: { "0x01ffc9a7": zeroAddress },
      data: { key: "0x12" },
      clear: true,
    });

    assert.deepStrictEqual(profiles, [
      ["text", "text records"],
      ["addresses", "address records"],
      ["contentHash", "content hash records"],
      ["abi", "ABI records"],
      ["pubkey", "public key records"],
      ["name", "name records"],
      ["interfaces", "interface records"],
      ["data", "data records"],
    ]);
  });

  it("needs no profile for empty record maps or `clear` alone", () => {
    assert.deepStrictEqual(
      writtenProfiles({ texts: {}, addresses: {}, data: {}, clear: true }),
      [],
    );
  });
});
