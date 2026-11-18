import { assert, describe, it } from "@effect/vitest";
import { Array, String as Str } from "effect";

import * as ContentHash from "@ensforge/sdk/internal/utils/ContentHash";
import { expectThrow } from "@ensforge/test-harness";
import { stringToHex } from "viem";

// ENSIP-7 IPFS example; the CIDv1 form is the same multihash.
const ipfsV0 = "QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4";
const ipfsV1 = "bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4";
const ipfsBytes = "0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f";
const swarmHash = "d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162";
const arweaveTx = "ys32Pt8uC7TrVxHdOLByOspfPEq2LO63wREHQIM9SJQ";
const onion3 = "p53lf57qovyuvwsc6xnrppyply3vtqm7l6pcobkmyqsiofyeznfu5uqd";

describe("ContentHash.encode", () => {
  it.each([
    [`ipfs://${ipfsV0}`, ipfsBytes],
    [`ipfs://${ipfsV1}`, ipfsBytes],
    [`bzz://${swarmHash}`, `0xe40101fa011b20${swarmHash}`],
    ["onion://zqktlwi4fecvo6ri", "0xbc037a716b746c776934666563766f367269"],
    [`onion3://${onion3}`, `0xbd03${Str.slice(2)(stringToHex(onion3))}`],
    [`ar://${arweaveTx}`, `0x90b2ca05${Buffer.from(arweaveTx, "base64url").toString("hex")}`],
  ])("encodes %s", (uri, expected) => {
    assert.strictEqual(ContentHash.encode(uri), expected);
  });

  it.each([
    "",
    "ipfs",
    "ipfs://",
    `IPFS://${ipfsV0}`,
    `swarm://${swarmHash}`,
    "https://example.com",
    "ipfs://nope",
    "ar://!!",
  ])("rejects %j", (uri) => {
    expectThrow(() => ContentHash.encode(uri), {
      _tag: "InvalidInputError",
      code: "INVALID_CONTENT_HASH",
    });
  });
});

describe("ContentHash.decode", () => {
  it.each([
    [ipfsBytes, "ipfs", ipfsV1],
    [`0xe40101fa011b20${swarmHash}`, "bzz", swarmHash],
    ["0xbc037a716b746c776934666563766f367269", "onion", "zqktlwi4fecvo6ri"],
    [
      "0xe50101720024080112205cbd1cc86ac20d6640795809c2a185bb2504538a2de8076da5a6971b8acb4715",
      "ipns",
      "k51qzi5uqu5dihst24f3rp2ej4co9berxohfkxaenbq1wjty7nrd5e9xp4afx1",
    ],
    [
      "0x90b2c60508004007fd43b74149b31aacbbf2784e874d09b086bed15fd54cacff7120cce95372",
      "sia",
      "CABAB_1Dt0FJsxqsu_J4TodNCbCGvtFf1Uys_3EgzOlTcg",
    ],
  ] as const)("decodes %s as %s", (data, protocol, value) => {
    assert.deepStrictEqual(ContentHash.decode(data), {
      protocol,
      value,
      uri: `${protocol}://${value}`,
    });
  });

  it("returns null for an empty record", () => {
    assert.isNull(ContentHash.decode("0x"));
  });

  it.each(["0xff", "0x00", `0x90b2da05${Str.repeat(32)("00")}`] as const)("rejects %s", (data) => {
    expectThrow(() => ContentHash.decode(data), {
      _tag: "InvalidInputError",
      code: "INVALID_CONTENT_HASH",
    });
  });
});

describe("ContentHash.toGatewayUrl", () => {
  it.each([
    [`ipfs://${ipfsV1}`, `https://ipfs.io/ipfs/${ipfsV1}`],
    ["ipns://app.eth", "https://ipfs.io/ipns/app.eth"],
    [`bzz://${swarmHash}`, `https://api.gateway.ethswarm.org/bzz/${swarmHash}`],
    [`ar://${arweaveTx}`, `https://arweave.net/${arweaveTx}`],
    ["onion://zqktlwi4fecvo6ri", "onion://zqktlwi4fecvo6ri"],
    ["https://example.com", "https://example.com"],
    ["not a uri", "not a uri"],
  ])("maps %s to %s", (uri, expected) => {
    assert.strictEqual(ContentHash.toGatewayUrl(uri), expected);
  });

  it("uses the given gateways, and the defaults for the rest", () => {
    const gateways = { ipfs: "https://gateway.example/", swarm: "https://swarm.example" };

    assert.deepStrictEqual(
      Array.map(
        [`ipfs://${ipfsV1}`, "ipns://app.eth", `bzz://${swarmHash}`, `ar://${arweaveTx}`],
        (uri) => ContentHash.toGatewayUrl(uri, gateways),
      ),
      [
        `https://gateway.example/ipfs/${ipfsV1}`,
        "https://gateway.example/ipns/app.eth",
        `https://swarm.example/bzz/${swarmHash}`,
        `https://arweave.net/${arweaveTx}`,
      ],
    );
    // Schemes without a gateway stay as they are, even ones named like object members.
    assert.strictEqual(
      ContentHash.toGatewayUrl("onion://zqktlwi4fecvo6ri", gateways),
      "onion://zqktlwi4fecvo6ri",
    );
    assert.strictEqual(ContentHash.toGatewayUrl("constructor://x"), "constructor://x");
  });
});
