import { assert, describe, it } from "@effect/vitest";

import { lowercaseOwnerNames } from "@ensforge/sdk/internal/internal/dns/wire";
import { bytesToHex, concat, stringToHex } from "viem";
import { packetToBytes } from "viem/ens";

// A resource record: owner name, then type, class IN, TTL 3600, RDLENGTH and the data.
const record = (owner: string, type: `0x${string}`, data: `0x${string}`) =>
  concat([
    bytesToHex(packetToBytes(owner)),
    type,
    "0x0001",
    "0x00000e10",
    `0x${((data.length - 2) / 2).toString(16).padStart(4, "0")}`,
    data,
  ]);

describe("lowercaseOwnerNames", () => {
  // `dns.getRecords` looks records up by the lowercase owner name.
  it("lowercases the ASCII letters of every owner name, and leaves record data as given", () => {
    const txt = concat(["0x0b", stringToHex("Hello WORLD")]);
    const records = concat([
      record("WWW.Alice.ETH", "0x0001", "0x7f000001"),
      record("Mail.Ünï.eth", "0x0010", txt),
    ]);

    assert.strictEqual(
      lowercaseOwnerNames(records),
      concat([
        record("www.alice.eth", "0x0001", "0x7f000001"),
        record("mail.Ünï.eth", "0x0010", txt),
      ]),
    );
  });

  it("rejects data that is not resource records", () => {
    const valid = record("www.alice.eth", "0x0001", "0x7f000001");

    for (const malformed of [valid.slice(0, -2), concat(["0x40", valid])] as `0x${string}`[]) {
      assert.throws(() => lowercaseOwnerNames(malformed), "Malformed DNS wire data.");
    }
  });
});
