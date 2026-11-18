import { String as Str } from "effect";

import { encode } from "@ensdomains/content-hash";
import type { Hex } from "viem";

/** Coin types (ENSIP-9 / ENSIP-11). */
export const coins = {
  btc: 0n,
  eth: 60n,
  /** ENSIP-19 default EVM address. */
  defaultEvm: 0x8000_0000n,
  base: 0x8000_2105n,
  polygon: 0x8000_0089n,
} as const;

/** Address bytes with their text form, from BIP-173 / BIP-350 test vectors. */
export const addresses = {
  btcSegwitV0: {
    text: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    bytes: "0x0014751e76e8199196d454941c45d1b3a323f1433bd6",
  },
  btcTaproot: {
    text: "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
    bytes: "0x512079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  },
} as const;

/** Content hashes of every codec ensforge decodes, plus one it does not know. */
export const contenthashes = {
  ipfs: `0x${encode("ipfs", "QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")}`,
  ipns: `0x${encode("ipns", "k51qzi5uqu5dgutdk6i1ynyzgkqngpha5xpgia3a5qqp4jsh0u4csozksxel3r")}`,
  swarm: `0x${encode("swarm", "d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162")}`,
  onion3: `0x${encode("onion3", "p53lf57qovyuvwsc6xnrppyply3vtqm7l6pcobkmyqsiofyeznfu5uqd")}`,
  arweave: `0x${encode("arweave", "ys32Pt8uC7TrVxHdOLByOspfPEq2LO63wREHQIM9SJQ")}`,
  unknown: "0xdeadbeef" as Hex,
} as const;

/** ABI records of three content types: JSON (1), zlib JSON (2) and URI (8). */
export const abis = [
  [1n, "0x5b5d"],
  [2n, "0x789c8b8e0500011500b9"],
  [8n, "0x68747470733a2f2f6578616d706c652e636f6d2f6162692e6a736f6e"],
] as const satisfies ReadonlyArray<readonly [bigint, Hex]>;

/** Texts that exercise encoding: unicode, an ENSIP-25 key, a `display` that does not match. */
export const texts = {
  url: "https://ensforge.com",
  description: "Records written by the ensforge devnet fixtures",
  "com.twitter": "ensforge",
  unicode: "こんにちは 👋 — Ünïcødé",
  display: "SOMEONE-ELSE.eth",
  "agent-registration[0x0000000000000000000000000000000000000001][1]": "agent",
} as const;

/** A text over 20 KB: readable, but expensive to read in one `eth_call`. */
export const hugeText = Str.repeat(8_000)("ens");
