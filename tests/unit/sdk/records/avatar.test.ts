import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import { resolveAvatar } from "@ensforge/sdk/internal/internal/avatar/resolve";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import { getAddress, type Abi, type Address } from "viem";
import { mainnet } from "viem/chains";

const token = getAddress("0x00000000000000000000000000000000000000ac");
const alice = getAddress("0x00000000000000000000000000000000000a11ce");
const bob = getAddress("0x0000000000000000000000000000000000000b0b");
const image = "https://example.com/token.png";

// A token held by alice, as both an ERC-721 and an ERC-1155.
const ens = Ensforge.create({
  chain: mainnet,
  transports: {
    [mainnet.id]: scriptedTransport(
      contractScript({
        contracts: [
          {
            address: token,
            abi: [...Abis.shared.erc721, ...Abis.shared.erc1155] as Abi,
            functions: {
              ownerOf: () => alice,
              tokenURI: () => "https://example.com/metadata.json",
              balanceOf: ([account]) => (account === alice ? 1n : 0n),
              uri: () => "https://example.com/{id}.json",
            },
          },
        ],
      }),
    ).transport,
  },
  publicRpc: false,
  batch: { multicall: false },
});

const avatarOf = (standard: "erc721" | "erc1155", owner: Address | null) =>
  resolveAvatar(ens, `eip155:1/${standard}:${token}/1`, {
    gateways: ens.config.gateways,
    timeout: 1_000,
    owner,
  });

describe("resolveAvatar", () => {
  // ENSIP-12: an NFT avatar counts only when the name's ETH address holds the token.
  it.effect("uses an NFT's image only when the name's address owns it", () =>
    Effect.gen(function* () {
      // The lane's setup restores the blocked fetch before each test.
      globalThis.fetch = () => Promise.resolve(Response.json({ image }));

      const results = yield* Effect.all(
        [
          avatarOf("erc721", alice),
          avatarOf("erc721", bob),
          avatarOf("erc1155", alice),
          avatarOf("erc1155", bob),
          avatarOf("erc721", null),
        ],
        { concurrency: 1 },
      );

      assert.deepStrictEqual(results, [image, null, image, null, null]);
    }),
  );

  // What `record.getAvatar` fails with under `strict` when an owned NFT's metadata cannot be loaded.
  it.effect("fails with a typed gateway error when the metadata cannot be loaded", () =>
    Effect.gen(function* () {
      globalThis.fetch = () => Promise.resolve(new Response("down", { status: 500 }));
      const down = yield* expectFailure(avatarOf("erc721", alice), {
        _tag: "GatewayError",
        code: "GATEWAY_REQUEST_FAILED",
      });
      assert.strictEqual(down.status, 500);

      globalThis.fetch = () => Promise.resolve(new Response("not json"));
      yield* expectFailure(avatarOf("erc721", alice), {
        _tag: "GatewayError",
        code: "GATEWAY_RESPONSE_INVALID",
      });
    }),
  );
});
