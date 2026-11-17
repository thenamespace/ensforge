import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { expectThrow } from "@ensforge/test-harness";

import { loadRecordCodecs } from "#/internal/records/codecs";

const btc = 0n;
const btcAddress = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const btcScript = "0x76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac";
const base = 0x8000_0000n | 8453n;

describe("loadRecordCodecs", () => {
  it.effect("loads the codecs of the coins asked for, and only those", () =>
    Effect.gen(function* () {
      const codecs = yield* loadRecordCodecs({ coinTypes: [btc, base] });

      assert.strictEqual(codecs.encodeAddress(btc, btcAddress), btcScript);
      assert.strictEqual(codecs.decodeAddress(btc, btcScript), btcAddress);
      assert.isUndefined(codecs.contentHash);
      assert.isUndefined(codecs.decodeAbiRecord);
    }),
  );

  it.effect("handles EVM coins without loading a codec", () =>
    Effect.gen(function* () {
      const codecs = yield* loadRecordCodecs({ coinTypes: [] });
      const address = "0x225f137127d9067788314bc7fcc1f36746a3c3B5";

      assert.strictEqual(codecs.encodeAddress(base, address), address.toLowerCase());
      assert.strictEqual(
        codecs.decodeAddress(base, address.toLowerCase() as `0x${string}`),
        address,
      );
    }),
  );

  it.effect("keeps the synchronous helpers' errors for coins it did not load", () =>
    Effect.gen(function* () {
      const codecs = yield* loadRecordCodecs({ coinTypes: [123_456_789n] });

      expectThrow(() => codecs.decodeAddress(123_456_789n, "0x01"), {
        _tag: "InvalidInputError",
        code: "INVALID_COIN_TYPE",
      });
      expectThrow(() => codecs.encodeAddress(btc, btcAddress), {
        _tag: "InvalidInputError",
        code: "INVALID_ADDRESS",
      });
    }),
  );

  it.effect("loads the content-hash and ABI codecs on request", () =>
    Effect.gen(function* () {
      const codecs = yield* loadRecordCodecs({ coinTypes: [], contentHash: true, abi: true });

      assert.isDefined(codecs.contentHash);
      assert.deepStrictEqual(codecs.decodeAbiRecord?.(8n, "0x68747470733a2f2f612e7863"), {
        contentType: 8n,
        data: "0x68747470733a2f2f612e7863",
        abi: null,
        uri: "https://a.xc",
      });
    }),
  );
});
