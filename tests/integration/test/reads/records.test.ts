import { assert, describe } from "@effect/vitest";
import { Effect, String as Str, Array as Arr, Record as Rec, pipe } from "effect";

import { Abis } from "@ensforge/contracts";
import { CoinType } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { avatarImage, Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { labelhash, namehash, stringToHex } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

// The text records both resolvers hold.
const texts = {
  url: "https://ensforge.com",
  description: "Records written by the ensforge devnet fixtures",
  "com.twitter": "ensforge",
  unicode: "こんにちは 👋 — Ünïcødé",
  display: "SOMEONE-ELSE.eth",
  "agent-registration[0x0000000000000000000000000000000000000001][1]": "agent",
};

describe("record reads", () => {
  // ENSv1 names resolve through ENSv1 before the launch and through the ENSv1 bridge after it.
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
      it.effect(
        "reads every profile of a PublicResolver",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const { accounts } = yield* Devnet;
            const { reader } = yield* Clients;

            const records = yield* Actions.record.get(reader, {
              name: fixtures.byId("records.v1").name,
              texts: [...Rec.keys(texts), "missing"] as readonly string[],
              // Results are keyed by the coin as given: Polygon's reads back as "2147483785".
              addresses: ["eth", "btc", "base", CoinType.fromChainId(137), "op"],
              contentHash: true,
              abi: true,
              pubkey: true,
              interfaces: ["0x01ffc9a7", "0x12345678"],
            });
            assert.deepStrictEqual(records.texts, { ...texts, missing: null });
            assert.deepStrictEqual(records.addresses, {
              eth: accounts.alice,
              btc: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
              base: accounts.carol,
              // An explicit zero address blocks the default; a coin without a record uses it.
              "2147483785": null,
              op: accounts.bob,
            });
            assert.strictEqual(
              records.contentHash?.value,
              "bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4",
            );
            // The lowest content type the mask allows.
            assert.strictEqual(records.abi?.contentType, 1n);
            assert.isNull(records.pubkey);
            assert.deepStrictEqual(records.interfaces, {
              "0x01ffc9a7": accounts.carol,
              "0x12345678": null,
            });
          }),
        {
          meta: {
            cases: [
              "M:B1",
              "K01",
              "K02",
              "K03",
              "K09",
              "K15",
              "K16",
              "K21",
              "K25",
              "K29",
              "K30",
              "K41",
            ],
          },
        },
      );

      it.effect(
        "does not read the default EVM address as an ETH address",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const { reader } = yield* Clients;
            const records = yield* Actions.record.get(reader, {
              name: fixtures.byId("records.avatar.https").name,
              addresses: [CoinType.fromChainId(0), "op"],
            });
            assert.deepStrictEqual(records.addresses, { "2147483648": null, op: null });
          }),
        { meta: { cases: ["K05"] } },
      );

      it.effect(
        "decodes taproot addresses and every content hash codec",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const { reader } = yield* Clients;
            const nameOf = (id: string) => fixtures.byId(id).name;

            const address = yield* Actions.record.getAddress(reader, {
              name: nameOf("records.btc-taproot"),
              coin: "btc",
            });
            assert.strictEqual(
              address,
              "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
            );
            const decoded = yield* Effect.forEach(
              ["ipns", "swarm", "onion3", "arweave"],
              (codec) =>
                Actions.record
                  .getContentHash(reader, { name: nameOf(`records.contenthash.${codec}`) })
                  .pipe(Effect.map((hash) => hash?.protocol)),
              { concurrency: 1 },
            );
            assert.deepStrictEqual(decoded, ["ipns", "bzz", "onion3", "ar"]);

            // An unknown codec is no content hash: null, or a typed error when strict.
            const unknown = nameOf("records.contenthash.unknown");
            const contentHash = yield* Actions.record.getContentHash(reader, { name: unknown });
            assert.isNull(contentHash);
            yield* expectFailure(
              Actions.record.getContentHash(reader, { name: unknown, strict: true }),
              {
                _tag: "NotFoundError",
                code: "RECORD_NOT_FOUND",
              },
            );
          }),
        { meta: { cases: ["K09", "K22", "K23"] } },
      );

      it.effect(
        "reads a 24 KB text in one call",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const { reader } = yield* Clients;
            const text = yield* Actions.record.getText(reader, {
              name: fixtures.byId("records.huge-text").name,
              key: "description",
            });
            assert.strictEqual(text?.length, 24_000);
          }),
        { meta: { cases: ["K19"] } },
      );

      it.effect(
        "returns avatars it can use and ignores the rest",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const { reader } = yield* Clients;
            const avatarOf = (id: string) =>
              Actions.record.getAvatar(reader, { name: fixtures.byId(id).name });

            const httpsAvatar = yield* avatarOf("records.avatar.https");
            assert.strictEqual(httpsAvatar, "https://ensforge.com/avatar.png");
            // Returned as data; consumers sanitize SVG.
            assert.match(
              (yield* avatarOf("records.avatar.data-svg")) ?? "",
              /^data:image\/svg\+xml/u,
            );
            const unknownSchemeAvatar = yield* avatarOf("records.avatar.unknown-scheme");
            assert.isNull(unknownSchemeAvatar);
            // NFTs count only when the name's ETH address holds them (ENSIP-12).
            const ownedErc721Avatar = yield* avatarOf("records.avatar.erc721-owned");
            assert.strictEqual(ownedErc721Avatar, avatarImage);
            const erc1155Avatar = yield* avatarOf("records.avatar.erc1155");
            assert.strictEqual(erc1155Avatar, avatarImage);
            const unownedErc721Avatar = yield* avatarOf("records.avatar.erc721-not-owned");
            assert.isNull(unownedErc721Avatar);
          }),
        { meta: { cases: ["K33", "K34", "K35", "K36", "K38"] } },
      );
    });
  }

  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "reads a PermissionedResolver, where a zero address is a record",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;

          const records = yield* Actions.record.get(reader, {
            name: fixtures.byId("records.v2").name,
            texts: Rec.keys(texts) as readonly string[],
            addresses: ["eth", "btc", "base", CoinType.fromChainId(137)],
            data: ["eth.ens.example", "missing"],
            abi: { contentTypes: 1n << 255n },
          });
          assert.deepStrictEqual(records.texts, texts);
          assert.deepStrictEqual(records.addresses, {
            eth: accounts.bob,
            btc: null,
            base: accounts.carol,
            "2147483785": null,
          });
          assert.deepStrictEqual(records.data, {
            "eth.ens.example": stringToHex("data record"),
            missing: null,
          });
          assert.strictEqual(records.abi?.contentType, 1n << 255n);
        }),
      { meta: { cases: ["M:B5", "K02", "K04", "K26", "K31", "K41"] } },
    );

    it.effect(
      "reads default and linked records",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const urlOf = (id: string) =>
            Actions.record.getText(reader, { name: fixtures.byId(id).name, key: "url" });

          const defaultUrl = yield* urlOf("records.v2.default");
          assert.strictEqual(defaultUrl, "https://default.example");
          const linkedUrl = yield* urlOf("records.v2.linked");
          assert.strictEqual(linkedUrl, texts.url);
        }),
      { meta: { cases: ["R21", "R22", "R23", "M:B7"] } },
    );
  });
});

// Subnames under alice's parent of the hierarchy fixtures; the deepest gets bob's address on
// the public resolver.
const createSubnames = (labels: readonly string[]) =>
  Effect.gen(function* () {
    const devnet = yield* Devnet;
    const chain = yield* Chain;
    const { alice, bob } = devnet.accounts;
    const resolver = devnet.contract("v1.publicResolver");
    let name = "v1-hierarchy.eth";

    for (const label of Arr.reverse(labels)) {
      yield* chain.write({
        address: devnet.contract("v1.registry"),
        abi: Abis.v1.ensRegistry,
        functionName: "setSubnodeRecord",
        args: [namehash(name), labelhash(label), alice, resolver, 0n],
        account: alice,
      });
      name = `${label}.${name}`;
    }

    yield* chain.write({
      address: resolver,
      abi: Abis.v1.publicResolver,
      functionName: "setAddr",
      args: [namehash(name), bob],
      account: alice,
    });
    return name;
  });

describe("record reads of names at the encoding limits", () => {
  onProfile("v1-live")("v1-live", (it) => {
    // The Universal Resolver receives the label as `[labelhash]` and hashes the same node.
    it.effect(
      "reads a name with a label over 255 bytes, sent by its labelhash",
      () =>
        Effect.gen(function* () {
          const chain = yield* Chain;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;

          yield* chain.isolated(
            Effect.gen(function* () {
              const name = yield* createSubnames([pipe("d", Str.repeat(300))]);
              const address = yield* Actions.record.getAddress(reader, { name });
              assert.strictEqual(address, accounts.bob);
            }),
          );
        }),
      { meta: { cases: ["H03"] } },
    );

    it.effect(
      "reads a name of ten 63-byte labels",
      () =>
        Effect.gen(function* () {
          const chain = yield* Chain;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;

          yield* chain.isolated(
            Effect.gen(function* () {
              const name = yield* createSubnames(
                Array.from({ length: 10 }, (_, level) => pipe(`${level}`, Str.padEnd(63, "e"))),
              );
              const address = yield* Actions.record.getAddress(reader, { name });
              assert.strictEqual(address, accounts.bob);
            }),
          );
        }),
      { meta: { cases: ["H23"] } },
    );
  });
});
