import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import { createPublicClient, getAddress, type Abi, type Address } from "viem";
import { mainnet } from "viem/chains";

import * as Ensforge from "#/client/Ensforge";
import { resolveAvatar } from "#/internal/avatar/resolve";

const token = getAddress("0x00000000000000000000000000000000000000ac");
const alice = getAddress("0x00000000000000000000000000000000000a11ce");
const bob = getAddress("0x0000000000000000000000000000000000000b0b");
const image = "https://example.com/token.png";

/** A token held by alice, as both an ERC-721 and an ERC-1155. */
const client = () => {
  const { transport } = scriptedTransport(
    contractScript({
      contracts: [
        {
          address: token,
          abi: [...Abis.shared.erc721, ...Abis.shared.erc1155] as Abi,
          functions: {
            ownerOf: () => alice,
            tokenURI: () => "https://example.com/metadata.json",
            balanceOf: ([account]) => ((account as Address) === alice ? 1n : 0n),
            uri: () => "https://example.com/{id}.json",
          },
        },
      ],
    }),
  );
  return Ensforge.create({
    publicClient: createPublicClient({ chain: mainnet, transport }),
    batch: { multicall: false },
  });
};

const avatarOf = (standard: "erc721" | "erc1155", owner: Address | null) =>
  resolveAvatar(client(), `eip155:1/${standard}:${token}/1`, {
    gateways: {},
    timeout: 1_000,
    owner,
  });

describe("resolveAvatar", () => {
  // ENSIP-12: an NFT avatar counts only when the name's ETH address holds the token.
  it.effect("uses an NFT's image only when the name's address owns it", () =>
    Effect.gen(function* () {
      globalThis.fetch = (async () => Response.json({ image })) as typeof fetch;

      const results = yield* Effect.all([
        avatarOf("erc721", alice),
        avatarOf("erc721", bob),
        avatarOf("erc1155", alice),
        avatarOf("erc1155", bob),
        avatarOf("erc721", null),
      ]);
      assert.deepStrictEqual(results, [image, null, image, null, null]);
    }),
  );
});
