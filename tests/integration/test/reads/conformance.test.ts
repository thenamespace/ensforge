import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions, Ensforge, ensActions } from "@ensforge/sdk";
import { Actions as Effects } from "@ensforge/sdk/effect";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { createPublicClient, custom, http } from "viem";

import { call, ensforge, isolated, onProfile } from "../support/chain.ts";

/** A client whose JSON-RPC requests are counted. */
const counted = (devnet: DevnetInstance) => {
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
  }).extend(ensActions());
  return { ens, calls: () => methods.filter((method) => method === "eth_call").length, methods };
};

describe("read conformance", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("gives the same result bound, standalone and as an Effect", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const ens = ensforge(yield* Devnet);
        const name = fixtures.byId("records.v2").name;
        const selection = { name, texts: ["url"], addresses: ["eth"] } as const;

        const bound = yield* Effect.all([
          call(() => ens.name.get({ name })),
          call(() => ens.record.get(selection)),
        ]);
        const standalone = yield* Effect.all([
          call(() => Actions.name.get(ens, { name })),
          call(() => Actions.record.get(ens, selection)),
        ]);
        const effect = yield* Effect.all([
          Effects.name.get(ens, { name }),
          Effects.record.get(ens, selection),
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
        const { ens, calls, methods } = counted(devnet);
        const budget = (read: () => Promise<unknown>) =>
          call(async () => {
            methods.length = 0;
            await read();
            return calls();
          });
        const records = fixtures.byId("records.v2").name;

        assert.deepStrictEqual(
          yield* Effect.all([
            budget(() => ens.name.get({ name: fixtures.byId("v2.registered").name })),
            budget(() => ens.name.get({ name: fixtures.byId("v2.reserved").name })),
            budget(() =>
              ens.record.get({
                name: records,
                texts: ["url", "description"],
                addresses: ["eth", "base"],
                contentHash: true,
              }),
            ),
            budget(() => ens.resolver.get({ name: records })),
            budget(() => ens.primaryName.get({ address: devnet.accounts.alice })),
          ]),
          [2, 2, 1, 3, 1],
        );
      }),
    );

    it.effect(
      "reads at a pinned block, with that block's time",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const ens = ensforge(devnet);
          const inGrace = fixtures.byId("v2.grace");
          const graceEnd = BigInt(String(inGrace.facts["expiry"])) + 28n * 86_400n;
          const pinned = yield* Effect.promise(() => devnet.client.getBlockNumber());

          const [before, after] = yield* isolated(
            devnet,
            Effect.promise(async () => {
              await devnet.client.setNextBlockTimestamp({ timestamp: graceEnd });
              await devnet.client.mine({ blocks: 1 });
            }).pipe(
              Effect.andThen(
                Effect.all([
                  call(() => ens.name.get({ name: inGrace.name, blockNumber: pinned })),
                  call(() => ens.name.get({ name: inGrace.name })),
                ]),
              ),
            ),
          );
          assert.deepStrictEqual([before.status, after.status], ["grace", "expired"]);
        }),
      { meta: { cases: ["M:E4", "T10"] } },
    );

    it.effect("rejects with the abort reason when the caller aborts", () =>
      Effect.gen(function* () {
        const ens = ensforge(yield* Devnet);
        const reason = new Error("left the page");
        const rejected = yield* Effect.promise(() =>
          ens.name.get({ name: "v2-plain.eth", signal: AbortSignal.abort(reason) }).then(
            () => undefined,
            (error: unknown) => error,
          ),
        );
        assert.strictEqual(rejected, reason);
      }),
    );
  });
});
