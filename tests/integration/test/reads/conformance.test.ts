import { assert, describe } from "@effect/vitest";
import { Effect, Predicate, String as Str, Array as Arr, pipe } from "effect";

import { Duration, Ensforge, Actions as Promises } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import {
  createPublicClient,
  custom,
  getAbiItem,
  http,
  multicall3Abi,
  numberToHex,
  toFunctionSelector,
} from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("read conformance", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("gives the same result bound, standalone and as an Effect", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { reader } = yield* Clients;
        const name = fixtures.byId("records.v2").name;
        const selection = { name, texts: ["url"], addresses: ["eth"] } as const;

        const bound = yield* Effect.all(
          [
            Effect.promise(() => reader.name.get({ name })),
            Effect.promise(() => reader.record.get(selection)),
          ],
          { concurrency: 1 },
        );
        const standalone = yield* Effect.all(
          [
            Effect.promise(() => Promises.name.get(reader, { name })),
            Effect.promise(() => Promises.record.get(reader, selection)),
          ],
          { concurrency: 1 },
        );
        const effect = yield* Effect.all(
          [Actions.name.get(reader, { name }), Actions.record.get(reader, selection)],
          { concurrency: 1 },
        );
        assert.deepStrictEqual(standalone, bound);
        assert.deepStrictEqual<unknown>(effect, bound);
      }),
    );

    // Reads are batched into multicall; these budgets catch extra rounds.
    it.effect("stays within its RPC budget", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const records = fixtures.byId("records.v2").name;

        // A client whose JSON-RPC requests are recorded.
        const methods: string[] = [];
        const upstream = http(devnet.rpcUrl)({ chain: devnet.chain });
        const transport = custom({
          request: (request) => {
            methods.push(request.method);
            return upstream.request(request);
          },
        });
        const ens = Ensforge.create({
          publicClient: createPublicClient({ chain: devnet.chain, transport }),
          deployment: devnet.deployments,
        });
        const ethCalls = <E>(read: Effect.Effect<unknown, E>) =>
          Effect.sync(() => methods.splice(0)).pipe(
            Effect.andThen(read),
            Effect.map(() => Arr.filter(methods, (method) => method === "eth_call").length),
          );

        const budgets = yield* Effect.all(
          [
            ethCalls(Actions.name.get(ens, { name: fixtures.byId("v2.registered").name })),
            ethCalls(Actions.name.get(ens, { name: fixtures.byId("v2.reserved").name })),
            ethCalls(
              Actions.record.get(ens, {
                name: records,
                texts: ["url", "description"],
                addresses: ["eth", "base"],
                contentHash: true,
              }),
            ),
            ethCalls(Actions.resolver.get(ens, { name: records })),
            ethCalls(Actions.primaryName.get(ens, { address: devnet.accounts.alice })),
          ],
          { concurrency: 1 },
        );
        assert.deepStrictEqual(budgets, [2, 2, 1, 3, 1]);
      }),
    );

    it.effect(
      "reads the same without Multicall3 on the chain, and with batching off",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { reader } = yield* Clients;
          // Batches sent through Multicall3 (`aggregate3`), from either client.
          const aggregate3 = toFunctionSelector(
            getAbiItem({ abi: multicall3Abi, name: "aggregate3" }),
          );
          let batched = 0;
          const upstream = http(devnet.rpcUrl)({ chain: devnet.chain });
          const transport = custom({
            request: (request) => {
              const [call] = Arr.isArray(request.params) ? request.params : [];
              const data = Predicate.hasProperty(call, "data") ? call.data : undefined;
              if (
                request.method === "eth_call" &&
                typeof data === "string" &&
                pipe(data, Str.startsWith(aggregate3))
              )
                batched += 1;
              return upstream.request(request);
            },
          });
          const withoutMulticall = Ensforge.create({
            publicClient: createPublicClient({
              chain: {
                ...devnet.chain,
                contracts: { ...devnet.chain.contracts, multicall3: undefined },
              },
              transport,
            }),
            deployment: devnet.deployments,
          });
          const unbatched = Ensforge.create({
            publicClient: createPublicClient({ chain: devnet.chain, transport }),
            deployment: devnet.deployments,
            batch: { multicall: false },
          });
          const reads = (ens: typeof reader | typeof unbatched) =>
            Effect.forEach(
              ["records.v1", "records.v2", "v1.wrapped"],
              (id) => {
                const { name } = fixtures.byId(id);
                return Effect.all(
                  [
                    Actions.name.get(ens, { name }),
                    Actions.resolver.get(ens, { name }),
                    Actions.record.get(ens, { name, texts: ["url"], addresses: ["eth", "btc"] }),
                  ],
                  { concurrency: 1 },
                );
              },
              { concurrency: 1 },
            );

          const expected = yield* reads(reader);
          const withoutMulticallReads = yield* reads(withoutMulticall);
          assert.deepStrictEqual<unknown>(withoutMulticallReads, expected);
          const unbatchedReads = yield* reads(unbatched);
          assert.deepStrictEqual<unknown>(unbatchedReads, expected);
          assert.strictEqual(batched, 0);
        }),
      { meta: { cases: ["M:F6", "M:F7"] } },
    );

    it.effect(
      "sends every contract read to the block it pins",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          // The block each `eth_call` names.
          const blocks: unknown[] = [];
          const upstream = http(devnet.rpcUrl)({ chain: devnet.chain });
          const transport = custom({
            request: (request) => {
              if (request.method === "eth_call" && Arr.isArray(request.params)) {
                blocks.push(request.params[1]);
              }
              return upstream.request(request);
            },
          });
          const ens = Ensforge.create({
            publicClient: createPublicClient({ chain: devnet.chain, transport }),
            deployment: devnet.deployments,
          });
          const blockNumber = yield* chain.blockNumber;
          const { name } = fixtures.byId("records.v1");

          yield* Effect.all(
            [
              Actions.name.get(ens, { name, blockNumber }),
              Actions.resolver.get(ens, { name, blockNumber }),
              Actions.record.get(ens, { name, texts: ["url"], addresses: ["eth"], blockNumber }),
              Actions.primaryName.get(ens, { address: devnet.accounts.alice, blockNumber }),
            ],
            { concurrency: 1 },
          );
          assert.isNotEmpty(blocks);
          assert.deepStrictEqual(new Set(blocks), new Set([numberToHex(blockNumber)]));
        }),
      { meta: { cases: ["F05"] } },
    );

    it.effect(
      "reads at a pinned block, with that block's time",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const chain = yield* Chain;
          const { reader } = yield* Clients;
          const inGrace = fixtures.byId("v2.grace");
          const graceEnd = BigInt(String(inGrace.facts["expiry"])) + Duration.days(28);
          const pinned = yield* chain.blockNumber;

          const [before, after] = yield* chain.atTimestamp(
            graceEnd,
            Effect.all(
              [
                Actions.name.get(reader, { name: inGrace.name, blockNumber: pinned }),
                Actions.name.get(reader, { name: inGrace.name }),
              ],
              { concurrency: 1 },
            ),
          );
          assert.deepStrictEqual([before.status, after.status], ["grace", "expired"]);
        }),
      { meta: { cases: ["M:E4", "T10"] } },
    );

    it.effect("rejects with the abort reason when the caller aborts", () =>
      Effect.gen(function* () {
        const { reader } = yield* Clients;
        const reason = new Error("left the page");

        const rejected = yield* Effect.promise(() =>
          reader.name.get({ name: "v2-plain.eth", signal: AbortSignal.abort(reason) }).then(
            () => undefined,
            (error: unknown) => error,
          ),
        );
        assert.strictEqual(rejected, reason);
      }),
    );
  });
});
