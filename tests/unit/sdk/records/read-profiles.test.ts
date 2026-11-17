import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { planRecordReads } from "@ensforge/sdk/internal/internal/records/read-profiles";
import { encodeAbiParameters, getAddress, namehash, zeroAddress, type Hex } from "viem";

const defaultAddress = getAddress("0x0000000000000000000000000000000000000b0b");
const addrResult = (bytes: Hex) => encodeAbiParameters([{ type: "bytes" }], [bytes]);

describe("planRecordReads", () => {
  // ENSIP-19: only a coin without its own record uses the default EVM address.
  it.effect("falls back to the default EVM address only for unset coins", () =>
    Effect.gen(function* () {
      const plan = planRecordReads(namehash("nick.eth"), {
        addresses: [0x8000_2105n, 0x8000_0089n],
      });
      const codecs = yield* plan.codecs;

      const output = plan.assemble(
        [addrResult("0x"), addrResult(zeroAddress), addrResult(defaultAddress)],
        codecs,
      );
      assert.deepStrictEqual(output.addresses, {
        [String(0x8000_2105n)]: defaultAddress,
        [String(0x8000_0089n)]: null,
      });
    }),
  );

  // Resolvers older than ENSIP-9 (catalog R11, R12) only answer the legacy `addr(bytes32)`.
  it.effect("reads ETH through the legacy addr when the resolver lacks ENSIP-9", () =>
    Effect.gen(function* () {
      const plan = planRecordReads(namehash("nick.eth"), { addresses: ["eth"] });
      const codecs = yield* plan.codecs;
      const legacy = encodeAbiParameters([{ type: "address" }], [defaultAddress]);

      assert.strictEqual(plan.calls.length, 2);
      assert.deepStrictEqual(plan.assemble([undefined, legacy], codecs).addresses, {
        eth: defaultAddress,
      });
      // An ENSIP-9 answer wins over the legacy one.
      const ensip9 = getAddress("0x00000000000000000000000000000000000a11ce");
      assert.deepStrictEqual(plan.assemble([addrResult(ensip9), legacy], codecs).addresses, {
        eth: ensip9,
      });
      assert.deepStrictEqual(
        plan.assemble(
          [undefined, encodeAbiParameters([{ type: "address" }], [zeroAddress])],
          codecs,
        ).addresses,
        { eth: null },
      );
    }),
  );
});
