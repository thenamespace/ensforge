import { assert, describe, it } from "@effect/vitest";
import { Arbitrary } from "effect";

import * as CoinType from "@ensforge/sdk/internal/utils/CoinType";
import { Arbitraries, expectThrow } from "@ensforge/test-harness";
import { getAddress, keccak256, toHex } from "viem";

const invalidCoinType = { _tag: "InvalidInputError", code: "INVALID_COIN_TYPE" };
const invalidAddress = { _tag: "InvalidInputError", code: "INVALID_ADDRESS" };
const base = 2_147_492_101n;
const vitalik = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const digest = Arbitrary.map(Arbitraries.uint(Number.MAX_SAFE_INTEGER), (seed) =>
  keccak256(toHex(seed)),
);

describe("CoinType.fromChainId", () => {
  it.each([
    [1, 60n],
    [0, 0x8000_0000n],
    [10, 0x8000_000an],
    [8453, base],
    [0x7fff_ffff, 0xffff_ffffn],
  ])("maps chain %i to %s", (chainId, expected) => {
    assert.strictEqual(CoinType.fromChainId(chainId), expected);
  });

  it.each([-1, 1.5, 0x8000_0000, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "rejects chain %s",
    (chainId) => {
      expectThrow(() => CoinType.fromChainId(chainId), invalidCoinType);
    },
  );

  it.prop("is ENSIP-11 and inverted by toChainId", [Arbitraries.uint(0x7fff_ffff)], ([chainId]) => {
    const coinType = CoinType.fromChainId(chainId);
    if (chainId !== 1) assert.strictEqual(coinType, 0x8000_0000n + BigInt(chainId));
    assert.isTrue(CoinType.isEvm(coinType));
    assert.strictEqual(CoinType.toChainId(coinType), chainId);
  });
});

describe("CoinType.from", () => {
  it.each([
    ["btc", 0n],
    ["BTC", 0n],
    ["ltc", 2n],
    ["eth", 60n],
    ["sol", 501n],
    ["base", base],
    [0n, 0n],
    [5n, 5n],
    [{ chainId: 1 }, 60n],
    [{ chainId: 8453 }, base],
  ] as const)("resolves %o to %s", (input, expected) => {
    assert.strictEqual(CoinType.from(input), expected);
  });

  it.each(["", "nope", "60", -1n, { chainId: -1 }, { chainId: 0x8000_0000 }] as const)(
    "rejects %o",
    (input) => {
      expectThrow(() => CoinType.from(input), invalidCoinType);
    },
  );
});

describe("CoinType classification", () => {
  it.each([
    [0n, false, null, "btc"],
    [2n, false, null, "ltc"],
    [60n, true, 1, "eth"],
    [3n, false, null, "doge"],
    [501n, false, null, "sol"],
    [0x7fff_ffffn, false, null, null],
    [0x8000_0000n, true, 0, "default"],
    [base, true, 8453, "base"],
    [123_456_789n, false, null, null],
  ] as const)("%s: isEvm %s, chain %s, symbol %s", (coinType, evm, chainId, symbol) => {
    assert.strictEqual(CoinType.isEvm(coinType), evm);
    assert.strictEqual(CoinType.toChainId(coinType), chainId);
    assert.strictEqual(CoinType.toSymbol(coinType), symbol);
  });
});

describe("CoinType EVM addresses", () => {
  it.each([60n, base, 0x8000_0000n + 999_999n])("stores 20 raw bytes for coin %s", (coinType) => {
    assert.strictEqual(
      CoinType.encodeAddress(coinType, vitalik),
      "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    );
    assert.strictEqual(
      CoinType.decodeAddress(coinType, "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"),
      vitalik,
    );
  });

  it("accepts addresses without a checksum", () => {
    assert.strictEqual(
      CoinType.encodeAddress(60n, vitalik.toUpperCase().replace("0X", "0x")),
      vitalik.toLowerCase(),
    );
  });

  it.each(["", "0x123", "nope", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"])(
    "encodeAddress rejects %j",
    (address) => {
      expectThrow(() => CoinType.encodeAddress(60n, address), invalidAddress);
    },
  );

  it.each([
    ["0x", 60n],
    ["0x0000000000000000000000000000000000000000", 60n],
    ["0x0000000000000000000000000000000000000000", base],
    ["0x", 0n],
  ] as const)("decodes %s for coin %s as empty", (data, coinType) => {
    assert.isNull(CoinType.decodeAddress(coinType, data));
  });

  it.prop(
    "decodeAddress inverts encodeAddress",
    [digest, Arbitraries.uint(0x7fff_ffff)],
    ([hash, chainId]) => {
      const address = getAddress(hash.slice(0, 42));
      const coinType = CoinType.fromChainId(chainId);
      assert.strictEqual(
        CoinType.decodeAddress(coinType, CoinType.encodeAddress(coinType, address)),
        address,
      );
    },
  );

  it.each(["0x1234", `0x${"00".repeat(12)}${"ab".repeat(20)}`] as const)(
    "decodeAddress rejects malformed EVM bytes %s with a typed error",
    (data) => {
      expectThrow(() => CoinType.decodeAddress(60n, data), invalidAddress);
    },
  );
});

describe("CoinType non-EVM addresses", () => {
  it.each([
    [
      0n,
      "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "0x76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac",
    ],
  ] as const)("routes coin %s to its codec: %s ↔ %s", (coinType, address, data) => {
    assert.strictEqual(CoinType.encodeAddress(coinType, address), data);
    assert.strictEqual(CoinType.decodeAddress(coinType, data), address);
  });

  it.each([
    [0n, ""],
    [0n, vitalik],
    [0n, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"],
    [501n, "TYPE"],
    [123_456_789n, "anything"],
  ] as const)("encodeAddress for coin %s rejects %j", (coinType, address) => {
    expectThrow(() => CoinType.encodeAddress(coinType, address), invalidAddress);
  });

  it("decodeAddress rejects coins without a codec", () => {
    expectThrow(() => CoinType.decodeAddress(123_456_789n, "0x01"), invalidCoinType);
  });

  it("decodeAddress rejects bytes the codec cannot read", () => {
    expectThrow(() => CoinType.decodeAddress(0n, "0x010203"), invalidAddress);
  });
});
