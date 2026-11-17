import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection } from "@ensforge/test-harness";
import { stringToHex } from "viem";

import { call, ensforge, onProfile } from "../support/chain.ts";

// Results are keyed by the coin as given: these read back as "2147483785" and "2147483648".
const polygon = 0x8000_0089n;
const defaultEvm = 0x8000_0000n;
const agentKey = "agent-registration[0x0000000000000000000000000000000000000001][1]";
const texts = {
  url: "https://ensforge.com",
  description: "Records written by the ensforge devnet fixtures",
  "com.twitter": "ensforge",
  unicode: "こんにちは 👋 — Ünïcødé",
  display: "SOMEONE-ELSE.eth",
  [agentKey]: "agent",
};
const ipfs = "bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4";

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
            const ens = ensforge(yield* Devnet);

            const records = yield* call(() =>
              ens.record.get({
                name: fixtures.byId("records.v1").name,
                texts: [...Object.keys(texts), "missing"] as readonly string[],
                addresses: ["eth", "btc", "base", polygon, "op"],
                contentHash: true,
                abi: true,
                pubkey: true,
                interfaces: ["0x01ffc9a7", "0x12345678"],
              }),
            );
            assert.deepStrictEqual(records.texts, { ...texts, missing: null });
            assert.deepStrictEqual(records.addresses, {
              eth: accounts.alice,
              btc: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
              base: accounts.carol,
              // An explicit zero address blocks the default; a coin without a record uses it.
              "2147483785": null,
              op: accounts.bob,
            });
            assert.strictEqual(records.contentHash?.value, ipfs);
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
            const ens = ensforge(yield* Devnet);
            const records = yield* call(() =>
              ens.record.get({
                name: fixtures.byId("records.avatar.https").name,
                addresses: [defaultEvm, "op"],
              }),
            );
            assert.deepStrictEqual(records.addresses, { "2147483648": null, op: null });
          }),
        { meta: { cases: ["K05"] } },
      );

      it.effect(
        "decodes taproot addresses and every content hash codec",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const ens = ensforge(yield* Devnet);
            const nameOf = (id: string) => fixtures.byId(id).name;

            assert.strictEqual(
              yield* call(() =>
                ens.record.getAddress({ name: nameOf("records.btc-taproot"), coin: "btc" }),
              ),
              "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
            );
            const decoded = yield* Effect.forEach(["ipns", "swarm", "onion3", "arweave"], (codec) =>
              call(() =>
                ens.record.getContentHash({ name: nameOf(`records.contenthash.${codec}`) }),
              ).pipe(Effect.map((hash) => hash?.protocol)),
            );
            assert.deepStrictEqual(decoded, ["ipns", "bzz", "onion3", "ar"]);

            // An unknown codec is no content hash: null, or a typed error when strict.
            const unknown = nameOf("records.contenthash.unknown");
            assert.isNull(yield* call(() => ens.record.getContentHash({ name: unknown })));
            yield* expectRejection(
              () => ens.record.getContentHash({ name: unknown, strict: true }),
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
            const ens = ensforge(yield* Devnet);
            const text = yield* call(() =>
              ens.record.getText({
                name: fixtures.byId("records.huge-text").name,
                key: "description",
              }),
            );
            assert.strictEqual(text?.length, 24_000);
          }),
        { meta: { cases: ["K19"] } },
      );

      it.effect(
        "returns avatars it can use and ignores the rest",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const ens = ensforge(yield* Devnet);
            const avatarOf = (id: string) =>
              call(() => ens.record.getAvatar({ name: fixtures.byId(id).name }));

            assert.strictEqual(
              yield* avatarOf("records.avatar.https"),
              "https://ensforge.com/avatar.png",
            );
            // Returned as data; consumers sanitize SVG.
            assert.match(
              (yield* avatarOf("records.avatar.data-svg")) ?? "",
              /^data:image\/svg\+xml/u,
            );
            assert.isNull(yield* avatarOf("records.avatar.unknown-scheme"));
            assert.isNull(yield* avatarOf("records.avatar.erc721-not-owned"));
          }),
        { meta: { cases: ["K33", "K34", "K36", "K38"] } },
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
          const ens = ensforge(yield* Devnet);

          const records = yield* call(() =>
            ens.record.get({
              name: fixtures.byId("records.v2").name,
              texts: Object.keys(texts) as readonly string[],
              addresses: ["eth", "btc", "base", polygon],
              data: ["eth.ens.example", "missing"],
              abi: { contentTypes: 1n << 255n },
            }),
          );
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
          const ens = ensforge(yield* Devnet);
          const urlOf = (id: string) =>
            call(() => ens.record.getText({ name: fixtures.byId(id).name, key: "url" }));

          assert.strictEqual(yield* urlOf("records.v2.default"), "https://default.example");
          assert.strictEqual(yield* urlOf("records.v2.linked"), texts.url);
        }),
      { meta: { cases: ["R21", "R22", "R23", "M:B7"] } },
    );
  });
});
