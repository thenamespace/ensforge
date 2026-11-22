import { assert, describe } from "@effect/vitest";
import { Effect, Option, String as Str, Array as Arr, pipe } from "effect";

import { Abis } from "@ensforge/contracts";
import { CoinType, Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import {
  bytesToHex,
  concat,
  decodeFunctionResult,
  encodeFunctionData,
  namehash,
  parseAbi,
  stringToHex,
  toFunctionSelector,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { packetToBytes } from "viem/ens";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

/** The header of an A record (type 1, class IN, TTL 3600) owned by `owner`, in wire format. */
const aRecordHeader = (owner: string) =>
  concat([bytesToHex(packetToBytes(owner)), "0x0001", "0x0001", "0x00000e10"]);

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
            const { accounts } = yield* Devnet;
            const chain = yield* Chain;
            const name = fixtures.byId(id).name;
            const ens = (yield* Clients).make({ account: accounts[holder] });
            const agentKey = "agent-registration[0x0000000000000000000000000000000000000001][1]";
            const ipfs = "ipfs://bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4";
            const base = CoinType.fromChainId(8453);
            const polygon = CoinType.fromChainId(137);

            yield* chain.isolated(
              Effect.gen(function* () {
                yield* Actions.record.setSync(ens, {
                  name,
                  texts: {
                    url: "https://lifecycle.example",
                    unicode: "Ünïcødé 👋",
                    [agentKey]: "agent-2",
                  },
                  addresses: {
                    eth: accounts.carol,
                    btc: "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
                    [String(base)]: accounts.user,
                    // An explicit zero address is a value, not a deletion.
                    [String(polygon)]: zeroAddress,
                  },
                  contentHash: ipfs,
                  abi: { contentType: 1n, value: [] },
                  interfaces: { "0x01ffc9a7": accounts.carol },
                });
                const resolver = (yield* Actions.resolver.get(ens, { name }))?.address;
                if (resolver === undefined) assert.fail("no resolver");

                // What the resolver stores, asked of the resolver itself. A PermissionedResolver
                // answers only through ENSIP-10 `resolve(name, data)`; the others answer
                // node-keyed calls too.
                const ask = <A>(abi: Abi, functionName: string, args: readonly unknown[]) => {
                  const data = encodeFunctionData({
                    abi,
                    functionName,
                    args: [namehash(name), ...args],
                  });
                  const answer =
                    id === "records.v2"
                      ? chain.read({
                          address: resolver,
                          abi: Abis.shared.extendedResolver,
                          functionName: "resolve",
                          args: [Name.dnsEncode(name), data],
                        })
                      : Effect.map(chain.call({ to: resolver, data }), (call) => call.data ?? "0x");
                  return Effect.map(
                    answer,
                    // The caller states the decoded type of `functionName`.
                    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
                    (result) => decodeFunctionResult({ abi, functionName, data: result }) as A,
                  );
                };
                const stored = Effect.all(
                  {
                    url: ask<string>(Abis.shared.textResolver, "text", ["url"]),
                    unicode: ask<string>(Abis.shared.textResolver, "text", ["unicode"]),
                    agent: ask<string>(Abis.shared.textResolver, "text", [agentKey]),
                    eth: ask<Hex>(Abis.shared.addressResolver, "addr", [60n]),
                    btc: ask<Hex>(Abis.shared.addressResolver, "addr", [0n]),
                    base: ask<Hex>(Abis.shared.addressResolver, "addr", [base]),
                    polygon: ask<Hex>(Abis.shared.addressResolver, "addr", [polygon]),
                    abi: ask<readonly [bigint, Hex]>(Abis.shared.abiResolver, "ABI", [1n]),
                    interface: ask<Address>(Abis.shared.interfaceResolver, "interfaceImplementer", [
                      "0x01ffc9a7",
                    ]),
                  },
                  { concurrency: 1 },
                );

                const raw = yield* stored;
                assert.deepInclude(raw, {
                  url: "https://lifecycle.example",
                  unicode: "Ünïcødé 👋",
                  agent: "agent-2",
                  eth: Str.toLowerCase(accounts.carol) as Hex,
                  btc: "0x512079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
                  base: Str.toLowerCase(accounts.user) as Hex,
                  polygon: zeroAddress,
                  interface: accounts.carol,
                });
                assert.deepStrictEqual(raw.abi, [1n, stringToHex("[]")]);
                assert.strictEqual(
                  (yield* Actions.record.getContentHash(ens, { name }))?.uri,
                  ipfs,
                );

                yield* Actions.record.setSync(ens, {
                  name,
                  texts: { url: null },
                  addresses: { btc: null },
                });
                const storedAfterClear = yield* stored;
                assert.deepInclude(storedAfterClear, { url: "", btc: "0x" });
              }),
            );
          }),
        { meta: { cases: ["K01", "K03", "K04", "K09", "K15", "K21", "K25", "K30", "K41"] } },
      );
    }

    it.effect(
      "links a name to another's records, and unlinks it",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.bob });
          const linked = fixtures.byId("records.v2.linked").name;
          const target = fixtures.byId("records.v2").name;
          const url = Actions.record.getText(ens, { name: linked, key: "url" });

          yield* chain.isolated(
            Effect.gen(function* () {
              const shared = yield* Actions.resolver.getLink(ens, { name: target });
              // Clearing a linked name gives it an empty record of its own.
              yield* Actions.record.setSync(ens, { name: linked, clear: true });
              const own = yield* Actions.resolver.getLink(ens, { name: linked });
              assert.notStrictEqual(own?.recordId, shared?.recordId);
              const urlAfterClear = yield* url;
              assert.isNull(urlAfterClear);

              yield* Actions.resolver.linkSync(ens, { name: linked, to: target });
              const urlAfterLink = yield* url;
              assert.strictEqual(urlAfterLink, "https://ensforge.com");

              // Unlinking does the same, and the records stay with the name it shared them with.
              yield* Actions.resolver.linkSync(ens, { name: linked, to: null });
              const urlAfterUnlink = yield* url;
              assert.isNull(urlAfterUnlink);
              const targetUrl = yield* Actions.record.getText(ens, { name: target, key: "url" });
              assert.strictEqual(targetUrl, "https://ensforge.com");
            }),
          );
        }),
      { meta: { cases: ["R22", "M:B7"] } },
    );

    // Regression: switching back to a resolver where the name still shared a record wrote the new
    // records into that shared record, changing every name linked to it.
    it.effect(
      "starts a name on a fresh record when it switches to a resolver holding one for it",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.bob });
          const linked = fixtures.byId("records.v2.linked").name;
          const target = fixtures.byId("records.v2").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              const shared = yield* Actions.resolver.get(ens, { name: linked });
              yield* Actions.resolver.setSync(ens, { name: linked, resolver: null });
              yield* Actions.record.setSync(ens, {
                name: linked,
                resolver: shared?.address ?? zeroAddress,
                texts: { url: "https://switched.example" },
              });

              const linkedUrl = yield* Actions.record.getText(ens, { name: linked, key: "url" });
              assert.strictEqual(linkedUrl, "https://switched.example");
              const targetUrl = yield* Actions.record.getText(ens, { name: target, key: "url" });
              assert.strictEqual(targetUrl, "https://ensforge.com");
            }),
          );
        }),
      { meta: { cases: ["R22"] } },
    );

    // Regression: a refused write to the resolver being switched to was explained against the
    // name's current resolver, where the signer may write.
    it.effect(
      "explains a refused write against the resolver it switches to",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const name = fixtures.byId("v2.registered").name;
          const other = yield* Actions.resolver.get(ens, {
            name: fixtures.byId("records.v2").name,
          });
          const resolver = other?.address ?? zeroAddress;

          const error = yield* expectFailure(
            Actions.record.set(ens, { name, resolver, texts: { url: "https://x.example" } }),
            { _tag: "UnauthorizedError", code: "MISSING_ROLES" },
          );
          assert.strictEqual(error.context.contract, resolver);
        }),
      { meta: { cases: ["R22"] } },
    );

    it.effect(
      "writes compressed and URI ABI records, and deletes every content type at once",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.bob });
          const name = fixtures.byId("records.v2").name;
          const abi = parseAbi(["function ping() returns (bool)"]);
          const abiOf = Actions.record
            .get(ens, { name, abi: true })
            .pipe(Effect.map((records) => records.abi));

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.record.setSync(ens, { name, abi: { value: null } });
              yield* Actions.record.setSync(ens, { name, abi: { contentType: 2n, value: abi } });
              const compressed = yield* abiOf;
              assert.deepInclude(compressed, { contentType: 2n, abi });

              yield* Actions.record.setSync(ens, {
                name,
                abi: { contentType: 8n, value: "ipfs://abi.example" },
              });
              // Regression: deleting without a content type cleared only JSON (type 1).
              yield* Actions.record.setSync(ens, { name, abi: { value: null } });
              const deleted = yield* abiOf;
              assert.isNull(deleted);
            }),
          );
        }),
      { meta: { cases: ["K26"] } },
    );

    // ENSIP-19: an unset EVM address falls back to the default EVM address; the zero address is a
    // set one, which blocks the fallback.
    it.effect(
      "falls back to the default EVM address for a deleted ETH address, not for the zero address",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.bob });
          const name = fixtures.byId("records.v2").name;
          const eth = Actions.record.getAddress(ens, { name });

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.record.setSync(ens, { name, addresses: { eth: null } });
              const fallback = yield* eth;
              assert.strictEqual(fallback, accounts.carol);

              yield* Actions.record.setSync(ens, { name, addresses: { eth: zeroAddress } });
              const blocked = yield* eth;
              assert.isNull(blocked);
            }),
          );
        }),
      { meta: { cases: ["K02"] } },
    );

    it.effect(
      "creates a resolver with records and points a name at it",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const name = fixtures.byId("v2.registered").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              const { resolver } = yield* Actions.resolver.createSync(ens, {
                name,
                records: {
                  texts: { url: "https://created.example" },
                  data: { "eth.ens.example": "0x1234" },
                },
              });
              yield* Actions.resolver.setSync(ens, { name, resolver });

              assert.strictEqual((yield* Actions.resolver.get(ens, { name }))?.address, resolver);
              const createdRecord = yield* Actions.record.get(ens, {
                name,
                texts: ["url"],
                data: ["eth.ens.example"],
              });
              assert.deepInclude(createdRecord, {
                texts: { url: "https://created.example" },
                data: { "eth.ens.example": "0x1234" },
              });
            }),
          );
        }),
      { meta: { cases: ["K31", "M:B5"] } },
    );

    it.effect(
      "clears every record of a name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const name = fixtures.byId("records.v1").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              const before = yield* Actions.resolver.get(ens, { name });

              yield* Actions.record.setSync(ens, { name, clear: true });

              // Clearing bumps the record version, which resets every profile at once.
              const after = yield* Actions.resolver.get(ens, { name });
              assert.strictEqual(after?.version, (before?.version ?? 0n) + 1n);
              const records = yield* Actions.record.get(ens, {
                name,
                texts: ["url", "description"],
                addresses: ["eth", "btc"],
                contentHash: true,
                abi: true,
                interfaces: ["0x01ffc9a7"],
              });
              assert.deepInclude(records, {
                texts: { url: null, description: null },
                addresses: { eth: null, btc: null },
                contentHash: null,
                abi: null,
                interfaces: { "0x01ffc9a7": null },
              });
            }),
          );
        }),
      { meta: { cases: ["M:B1", "R28"] } },
    );

    it.effect(
      "writes records to a new resolver before pointing the name at it",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const name = fixtures.byId("records.v1").name;
          const options = {
            name,
            texts: { url: "https://moved.example" },
            resolver: "default",
          } as const;

          const plan = yield* Actions.record.set.prepare(ens, options);
          const calls = Arr.flatMap(plan.steps, (step) => step.calls);
          const setResolver = toFunctionSelector("setResolver(bytes32,address)");
          const pointed = Option.getOrElse(
            Arr.findFirstIndex(calls, (item) => pipe(item.data, Str.startsWith(setResolver))),
            () => -1,
          );
          assert.isAbove(pointed, 0, "records first, then setResolver");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.record.setSync(ens, options);

              const text = yield* Actions.record.getText(ens, { name, key: "url" });
              assert.strictEqual(text, "https://moved.example");
            }),
          );
        }),
      { meta: { cases: ["M:B3"] } },
    );

    it.effect(
      "clears a name's records without revealing the PermissionedResolver's default record",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.carol });
          const name = fixtures.byId("records.v2.default").name;
          const url = Actions.record.getText(ens, { name, key: "url" });

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.record.setSync(ens, { name, texts: { url: "https://own.example" } });
              const ownUrl = yield* url;
              assert.strictEqual(ownUrl, "https://own.example");

              // Regression: the cleared name read the resolver's default record (the root name's).
              yield* Actions.record.setSync(ens, { name, clear: true });
              const urlAfterClear = yield* url;
              assert.isNull(urlAfterClear);
            }),
          );
        }),
      { meta: { cases: ["K40"] } },
    );

    it.effect(
      "reads DNS records by owner name in any case, and deletes a record set with empty data",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const name = fixtures.byId("records.v1").name;
          // An A record for `www.<name>`, and the same with no data. Owner names are written in any
          // case and stored lowercase, as they are looked up.
          const upper = aRecordHeader(`WWW.${Str.toUpperCase(name)}`);
          const www = Actions.dns
            .getRecords(ens, { name, records: [{ name: `Www.${name}`, type: 1 }] })
            .pipe(Effect.map(({ records }) => records[0]?.data));

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.dns.setRecordsSync(ens, {
                name,
                records: concat([upper, "0x0004", "0x7f000001"]),
              });
              const wwwAfterSet = yield* www;
              assert.strictEqual(
                wwwAfterSet,
                concat([aRecordHeader(`www.${name}`), "0x0004", "0x7f000001"]),
              );

              yield* Actions.dns.setRecordsSync(ens, { name, records: concat([upper, "0x0000"]) });
              const wwwAfterEmptyRecord = yield* www;
              assert.isNull(wwwAfterEmptyRecord);
            }),
          );
        }),
      { meta: { cases: ["K32"] } },
    );
  });
});
