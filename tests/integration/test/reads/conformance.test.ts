import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Duration, Ensforge, Actions as Promises } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { createPublicClient, custom, http } from "viem";

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

        const bound = yield* Effect.all([
          Effect.promise(() => reader.name.get({ name })),
          Effect.promise(() => reader.record.get(selection)),
        ]);
        const standalone = yield* Effect.all([
          Effect.promise(() => Promises.name.get(reader, { name })),
          Effect.promise(() => Promises.record.get(reader, selection)),
        ]);
        const effect = yield* Effect.all([
          Actions.name.get(reader, { name }),
          Actions.record.get(reader, selection),
        ]);
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
        const ethCalls = (read: Effect.Effect<unknown, unknown>) =>
          Effect.sync(() => methods.splice(0)).pipe(
            Effect.andThen(read),
            Effect.map(() => methods.filter((method) => method === "eth_call").length),
          );

        const budgets = yield* Effect.all([
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
        ]);
        assert.deepStrictEqual(budgets, [2, 2, 1, 3, 1]);
      }),
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
            Effect.all([
              Actions.name.get(reader, { name: inGrace.name, blockNumber: pinned }),
              Actions.name.get(reader, { name: inGrace.name }),
            ]),
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
