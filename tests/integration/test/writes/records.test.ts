import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import {
  decodeFunctionResult,
  encodeFunctionData,
  namehash,
  stringToHex,
  toFunctionSelector,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";

import { call, ensforge, isolated, onProfile } from "../support/chain.ts";

const taproot = {
  text: "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
  bytes: "0x512079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
} as const;
const agentKey = "agent-registration[0x0000000000000000000000000000000000000001][1]";
const ipfs = "ipfs://bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4";
const base = 0x8000_2105n;
const polygon = 0x8000_0089n;

/**
 * What a resolver stores for `name`, asked of the resolver itself. A PermissionedResolver answers
 * only through ENSIP-10 `resolve(name, data)`; the others answer node-keyed calls too.
 */
const stored = (devnet: DevnetInstance, resolver: Address, name: string, extended: boolean) => {
  const node = namehash(name);
  const read = <A>(abi: Abi, functionName: string, args: readonly unknown[]) => {
    const data = encodeFunctionData({ abi, functionName, args: [node, ...args] } as never);
    return Effect.promise(async () => {
      const answer = extended
        ? await devnet.client.readContract({
            address: resolver,
            abi: Abis.shared.extendedResolver,
            functionName: "resolve",
            args: [Name.dnsEncode(name), data],
          })
        : ((await devnet.client.call({ to: resolver, data })).data ?? "0x");
      return decodeFunctionResult({ abi, functionName, data: answer } as never) as A;
    });
  };
  return Effect.all({
    url: read<string>(Abis.shared.textResolver, "text", ["url"]),
    unicode: read<string>(Abis.shared.textResolver, "text", ["unicode"]),
    agent: read<string>(Abis.shared.textResolver, "text", [agentKey]),
    eth: read<Hex>(Abis.shared.addressResolver, "addr", [60n]),
    btc: read<Hex>(Abis.shared.addressResolver, "addr", [0n]),
    base: read<Hex>(Abis.shared.addressResolver, "addr", [base]),
    polygon: read<Hex>(Abis.shared.addressResolver, "addr", [polygon]),
    abi: read<readonly [bigint, Hex]>(Abis.shared.abiResolver, "ABI", [1n]),
    interface: read<Address>(Abis.shared.interfaceResolver, "interfaceImplementer", ["0x01ffc9a7"]),
  });
};

describe("record writes", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    for (const [id, holder] of [
      ["records.v1", "alice"],
      ["records.v2", "bob"],
    ] as const) {
      it.effect(
        `writes every encoding and deletes with null (${id})`,
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const devnet = yield* Devnet;
            const { accounts } = devnet;
            const name = fixtures.byId(id).name;
            const ens = ensforge(devnet, { account: accounts[holder] });

            yield* isolated(
              devnet,
              Effect.gen(function* () {
                yield* call(() =>
                  ens.record.setSync({
                    name,
                    texts: {
                      url: "https://lifecycle.example",
                      unicode: "Ünïcødé 👋",
                      [agentKey]: "agent-2",
                    },
                    addresses: {
                      eth: accounts.carol,
                      btc: taproot.text,
                      [String(base)]: accounts.user,
                      // An explicit zero address is a value, not a deletion.
                      [String(polygon)]: zeroAddress,
                    },
                    contentHash: ipfs,
                    abi: { contentType: 1n, value: [] },
                    interfaces: { "0x01ffc9a7": accounts.carol },
                  }),
                );
                const resolver = (yield* call(() => ens.resolver.get({ name })))?.address;
                if (resolver === undefined) return assert.fail("no resolver");

                const extended = id === "records.v2";
                const raw = yield* stored(devnet, resolver, name, extended);
                assert.deepInclude(raw, {
                  url: "https://lifecycle.example",
                  unicode: "Ünïcødé 👋",
                  agent: "agent-2",
                  eth: accounts.carol.toLowerCase() as Hex,
                  btc: taproot.bytes,
                  base: accounts.user.toLowerCase() as Hex,
                  polygon: zeroAddress,
                  interface: accounts.carol,
                });
                assert.deepStrictEqual(raw.abi, [1n, stringToHex("[]")]);
                assert.strictEqual(
                  (yield* call(() => ens.record.getContentHash({ name })))?.uri,
                  ipfs,
                );

                yield* call(() =>
                  ens.record.setSync({ name, texts: { url: null }, addresses: { btc: null } }),
                );
                assert.deepInclude(yield* stored(devnet, resolver, name, extended), {
                  url: "",
                  btc: "0x",
                });
              }),
            );
          }),
        { meta: { cases: ["K01", "K03", "K04", "K09", "K15", "K21", "K25", "K30", "K41"] } },
      );
    }

    it.effect(
      "clears every record of a name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const ens = ensforge(devnet, { account: devnet.accounts.alice });
          const name = fixtures.byId("records.v1").name;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* call(() => ens.record.setSync({ name, clear: true }));
              const records = yield* call(() =>
                ens.record.get({
                  name,
                  texts: ["url", "description"],
                  addresses: ["eth", "btc"],
                  contentHash: true,
                }),
              );
              assert.deepInclude(records, {
                texts: { url: null, description: null },
                addresses: { eth: null, btc: null },
                contentHash: null,
              });
            }),
          );
        }),
      { meta: { cases: ["M:B1"] } },
    );

    it.effect(
      "writes records to a new resolver before pointing the name at it",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const ens = ensforge(devnet, { account: devnet.accounts.alice });
          const name = fixtures.byId("records.v1").name;
          const options = {
            name,
            texts: { url: "https://moved.example" },
            resolver: "default",
          } as const;

          const plan = yield* call(() => ens.record.set.prepare(options));
          const calls = plan.steps.flatMap((step) => step.calls);
          const setResolver = toFunctionSelector("setResolver(bytes32,address)");
          const pointed = calls.findIndex((item) => item.data.startsWith(setResolver));
          assert.isAbove(pointed, 0, "records first, then setResolver");

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* call(() => ens.record.setSync(options));
              assert.strictEqual(
                yield* call(() => ens.record.getText({ name, key: "url" })),
                "https://moved.example",
              );
            }),
          );
        }),
      { meta: { cases: ["M:B3"] } },
    );
  });
});
