import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { permissionedResolverResource } from "@ensforge/contracts/v2";
import type { StepContext } from "@ensforge/test-devnet";
import {
  encodeFunctionData,
  hexToBigInt,
  namehash,
  stringToHex,
  zeroAddress,
  type Address,
} from "viem";

import { expectState } from "../builders/check.ts";
import { dnsEncode, labelId } from "../builders/names.ts";
import { resolveText, setV1Records, setV2Records, type Records } from "../builders/records.ts";
import { registerV1 } from "../builders/v1.ts";
import { ownedResolver, registerV2 } from "../builders/v2.ts";
import type { Fixture } from "../fixture.ts";
import { durations } from "./durations.ts";
import { abis, addresses, coins, contenthashes, hugeText, texts } from "./values.ts";

const v1Text = (c: StepContext, resolver: Address, name: string, key: string) =>
  c.read<string>([resolver, "v1/PublicResolver"], "text", [namehash(name), key]);

/** A v1 name on the current PublicResolver with `records`, written by its owner. */
const v1WithRecords = (
  id: string,
  label: string,
  cases: readonly string[],
  tags: Record<string, string>,
  records: (c: StepContext) => Effect.Effect<Records, never, never> | Records,
  owner: "alice" | "bob" = "alice",
): Fixture => ({
  id,
  cases,
  tags: { kind: "v1-unwrapped", resolver: "public-resolver", ...tags },
  prelaunch: (c) =>
    Effect.gen(function* () {
      const account = c.accounts[owner];
      const name = yield* registerV1(c, { label, owner: account, duration: durations.active });
      const resolved = records(c);
      const written = Effect.isEffect(resolved) ? yield* resolved : resolved;
      yield* setV1Records(c, {
        resolver: name.resolver,
        node: name.node,
        from: account,
        records: written,
      });
      return { name: name.name, resolver: name.resolver, owner: account };
    }),
  check: (c, facts) =>
    Effect.gen(function* () {
      const written = records(c);
      const expected = Effect.isEffect(written) ? yield* written : written;
      const resolver = facts["resolver"] as Address;
      for (const [key, value] of Object.entries(expected.texts ?? {})) {
        const actual = yield* v1Text(c, resolver, String(facts["name"]), key);
        yield* expectState(id, `text ${key.slice(0, 40)}`, actual, value);
      }
      if (expected.contenthash !== undefined) {
        const actual = yield* c.read([resolver, "v1/PublicResolver"], "contenthash", [
          namehash(String(facts["name"])),
        ]);
        yield* expectState(id, "contenthash", actual, expected.contenthash);
      }
    }),
});

const avatar = (
  kind: string,
  cases: readonly string[],
  uri: (c: StepContext) => Effect.Effect<string>,
) =>
  v1WithRecords(
    `records.avatar.${kind}`,
    `avatar-${kind}`,
    cases,
    { records: "avatar", avatar: kind },
    (c) =>
      uri(c).pipe(
        Effect.map((value) => ({
          texts: { avatar: value },
          addresses: [[coins.eth, c.accounts.alice]],
        })),
      ),
  );

// Avatars that point at tokens: the `.eth` registrar (ERC-721) and the NameWrapper (ERC-1155).
const tokenUri = (c: StepContext, standard: "erc721" | "erc1155", key: string, id: bigint) =>
  c.address(key).pipe(
    Effect.map((contract) => `eip155:31337/${standard}:${contract.toLowerCase()}/${id}`),
    Effect.orDie,
  );

/** Records of every encoding, avatar kinds, content hash codecs, and PermissionedResolver records. */
export const records: readonly Fixture[] = [
  v1WithRecords(
    "records.v1",
    "records-v1",
    ["M:B1", "K01", "K02", "K03", "K05", "K09", "K15", "K16", "K25", "K29", "K30", "K41"],
    { records: "full" },
    (c) => ({
      texts,
      addresses: [
        [coins.eth, c.accounts.alice],
        [coins.btc, addresses.btcSegwitV0.bytes],
        [coins.defaultEvm, c.accounts.bob],
        [coins.base, c.accounts.carol],
        // An explicit zero address: set, so the default EVM address must not apply.
        [coins.polygon, zeroAddress],
      ],
      contenthash: contenthashes.ipfs,
      abis,
      interfaces: [["0x01ffc9a7", c.accounts.carol]],
    }),
  ),
  v1WithRecords(
    "records.btc-taproot",
    "records-taproot",
    ["K09"],
    { records: "btc-taproot" },
    () => ({
      addresses: [[coins.btc, addresses.btcTaproot.bytes]],
    }),
  ),
  ...Object.entries(contenthashes).map(([codec, contenthash]) =>
    v1WithRecords(
      `records.contenthash.${codec}`,
      `contenthash-${codec}`,
      codec === "unknown" ? ["K23"] : codec === "ipfs" ? ["K21"] : ["K22"],
      { records: "contenthash", codec },
      () => ({ contenthash }),
    ),
  ),
  v1WithRecords("records.huge-text", "records-huge", ["K19"], { records: "huge-text" }, () => ({
    texts: { description: hugeText },
  })),
  avatar("https", ["K33"], () => Effect.succeed("https://ensforge.com/avatar.png")),
  avatar("erc721-owned", ["K34"], (c) =>
    tokenUri(c, "erc721", "v1.baseRegistrar", labelId("v1-plain")),
  ),
  avatar("erc1155", ["K35"], (c) =>
    tokenUri(c, "erc1155", "v1.nameWrapper", hexToBigInt(namehash("w-plain.eth"))),
  ),
  avatar("data-svg", ["K36"], () =>
    Effect.succeed(
      `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64")}`,
    ),
  ),
  avatar("unknown-scheme", ["K38"], () => Effect.succeed("ftp://ensforge.com/avatar.png")),
  // The token is alice's, but this name's address is bob's: the avatar is not owned.
  v1WithRecords(
    "records.avatar.erc721-not-owned",
    "avatar-not-owned",
    ["K34"],
    { records: "avatar", avatar: "erc721-not-owned" },
    (c) =>
      tokenUri(c, "erc721", "v1.baseRegistrar", labelId("v1-plain")).pipe(
        Effect.map((value) => ({
          texts: { avatar: value },
          addresses: [[coins.eth, c.accounts.bob]],
        })),
      ),
    "bob",
  ),
  {
    id: "records.v2",
    cases: ["M:B5", "K02", "K04", "K31", "K24", "K26"],
    tags: { kind: "v2-native", resolver: "permissioned", records: "full" },
    v2: true,
    postlaunch: (c) =>
      Effect.gen(function* () {
        const resolver = yield* ownedResolver(c, { admin: c.accounts.bob });
        const name = yield* registerV2(c, {
          label: "records-v2",
          owner: c.accounts.bob,
          duration: durations.active,
          resolver,
        });
        yield* setV2Records(c, {
          resolver,
          name: name.name,
          from: c.accounts.bob,
          records: {
            texts,
            addresses: [
              [coins.eth, c.accounts.bob],
              [coins.defaultEvm, c.accounts.carol],
              // On a PermissionedResolver a zero address counts as set (`hasAddr`).
              [coins.polygon, zeroAddress],
            ],
            contenthash: contenthashes.ipfs,
            abis: [...abis, [1n << 255n, "0x5b5d"]],
            data: { "eth.ens.example": stringToHex("data record") },
          },
        });
        return { name: name.name, resolver, owner: c.accounts.bob };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const url = yield* resolveText(c, {
          resolver: facts["resolver"] as Address,
          name: String(facts["name"]),
          key: "url",
        });
        yield* expectState("records.v2", "url", url, texts.url);
      }),
  },
  {
    id: "records.v2.default",
    cases: ["R21", "K40"],
    tags: { kind: "v2-native", resolver: "permissioned", records: "default-fallback" },
    v2: true,
    // Records on the DNS root `""` of a PermissionedResolver answer for names without their own.
    postlaunch: (c) =>
      Effect.gen(function* () {
        const resolver = yield* ownedResolver(c, { admin: c.accounts.carol });
        const name = yield* registerV2(c, {
          label: "records-defaulted",
          owner: c.accounts.carol,
          duration: durations.active,
          resolver,
        });
        yield* setV2Records(c, {
          resolver,
          name: "",
          from: c.accounts.carol,
          records: { texts: { url: "https://default.example" } },
        });
        return { name: name.name, resolver, defaultUrl: "https://default.example" };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const url = yield* resolveText(c, {
          resolver: facts["resolver"] as Address,
          name: String(facts["name"]),
          key: "url",
        });
        yield* expectState("records.v2.default", "default url", url, facts["defaultUrl"]);
      }),
  },
  {
    id: "records.v2.linked",
    cases: ["M:B7", "R22", "R23"],
    tags: { kind: "v2-native", resolver: "permissioned", records: "linked" },
    v2: true,
    // `records-linked.eth` shares `records-v2.eth`'s records (both on bob's resolver).
    postlaunch: (c) =>
      Effect.gen(function* () {
        const resolver = yield* c.read<Address>("v2.ethRegistry", "getResolver", ["records-v2"]);
        const name = yield* registerV2(c, {
          label: "records-linked",
          owner: c.accounts.bob,
          duration: durations.active,
          resolver,
        });
        yield* c.write(
          [resolver, "v2/PermissionedResolverImpl"],
          "linkToNode",
          [dnsEncode(name.name), namehash("records-v2.eth")],
          { from: c.accounts.bob },
        );
        return { name: name.name, resolver, target: "records-v2.eth" };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const url = yield* resolveText(c, {
          resolver: facts["resolver"] as Address,
          name: String(facts["name"]),
          key: "url",
        });
        yield* expectState("records.v2.linked", "linked url", url, texts.url);
      }),
  },
  {
    id: "records.v2.partial-roles",
    cases: ["M:B6", "M:D7"],
    tags: { kind: "v2-native", resolver: "permissioned", roles: "text-url-only" },
    v2: true,
    // Carol may set `url` on bob's resolver and nothing else.
    postlaunch: (c) =>
      Effect.gen(function* () {
        const resolver = yield* c.read<Address>("v2.ethRegistry", "getResolver", ["records-v2"]);
        // Record roles are granted by example setter call; the resolver derives the resource
        // (here: the `url` key) from its argument.
        const setter = encodeFunctionData({
          abi: Abis.v2.permissionedResolver,
          functionName: "setText",
          args: [dnsEncode("records-v2.eth"), "url", ""],
        });
        yield* c.write(
          [resolver, "v2/PermissionedResolverImpl"],
          "grantSetterRoles",
          [setter, c.accounts.carol],
          {
            from: c.accounts.bob,
          },
        );
        return { name: "records-v2.eth", resolver, delegate: c.accounts.carol };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const allowed = yield* c.read(
          [facts["resolver"] as Address, "v2/PermissionedResolverImpl"],
          "hasRoles",
          [permissionedResolverResource({ text: "url" }), Roles.resolver.setText, c.accounts.carol],
        );
        yield* expectState("records.v2.partial-roles", "carol may set url", allowed, true);
      }),
  },
];
