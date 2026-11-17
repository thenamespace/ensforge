import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { encodeAbiParameters, getAddress, namehash, zeroAddress, type Hex } from "viem";

import { planRecordReads } from "#/internal/records/read-profiles";

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
});
