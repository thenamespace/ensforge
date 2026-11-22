import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { loadRecordCodecs } from "@ensforge/sdk/internal/internal/records/codecs";
import {
  encodeRecordWrites,
  writtenProfiles,
} from "@ensforge/sdk/internal/internal/records/write-profiles";
import { expectThrow } from "@ensforge/test-harness";
import { decodeFunctionData, namehash, parseAbi, toHex, zeroAddress } from "viem";
import { packetToBytes } from "viem/ens";

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

// Compressed and CBOR ABI records were writable only as raw bytes; the encoder must produce what
// readers decode.
describe("encodeRecordWrites ABI records", () => {
  const abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
  const target = { node: namehash("alice.eth"), dns: toHex(packetToBytes("alice.eth")) };
  const written = (writes: Parameters<typeof encodeRecordWrites>[2]) =>
    Effect.gen(function* () {
      const codecs = yield* loadRecordCodecs({ coinTypes: [], abi: true, abiEncode: true });
      const [call] = encodeRecordWrites("node", target, writes, codecs);
      const decoded = decodeFunctionData({ abi: Abis.v1.publicResolver, data: call ?? "0x" });
      if (decoded.functionName !== "setABI") return assert.fail(`decoded ${decoded.functionName}`);
      const [, contentType, data] = decoded.args;
      return codecs.decodeAbiRecord?.(contentType, data);
    });

  it.effect.each([[2n], [4n]] as const)("round-trips an ABI as content type %s", ([contentType]) =>
    Effect.gen(function* () {
      const record = yield* written({ abi: { contentType, value: abi } });

      assert.deepStrictEqual(record?.abi, abi);
    }),
  );

  it.effect("writes a URI record from a string, and only as content type 8", () =>
    Effect.gen(function* () {
      const record = yield* written({ abi: { contentType: 8n, value: "ipfs://abi.json" } });
      assert.strictEqual(record?.uri, "ipfs://abi.json");

      const codecs = yield* loadRecordCodecs({ coinTypes: [] });
      expectThrow(
        () => encodeRecordWrites("node", target, { abi: { value: "ipfs://abi.json" } }, codecs),
        { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
      );
    }),
  );

  it.effect("deletes every stored content type when none is named", () =>
    Effect.gen(function* () {
      const codecs = yield* loadRecordCodecs({ coinTypes: [] });
      const calls = encodeRecordWrites(
        "node",
        target,
        { abi: { value: null }, abiContentTypes: [2n, 8n] },
        codecs,
      );

      assert.deepStrictEqual(
        Arr.map(
          calls,
          (call) => decodeFunctionData({ abi: Abis.v1.publicResolver, data: call }).args,
        ),
        [
          [target.node, 2n, "0x"],
          [target.node, 8n, "0x"],
        ],
      );
    }),
  );
});
