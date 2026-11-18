import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { parseAbi } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

const unsupported = { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" } as const;

describe("writes a resolver cannot take", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "record.set refuses records an extended resolver declares no profile for",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const name = fixtures.byId("resolver.offchain").name;

          // Its fallback answers any setter, so the write used to be mined and store nothing.
          const error = yield* expectFailure(
            Actions.record.set.prepare(ens, { name, texts: { url: "https://lost.example" } }),
            unsupported,
          );
          assert.strictEqual(error.feature, "text records");
        }),
      { meta: { cases: ["M:B10", "X16"] } },
    );

    it.effect(
      "record.set refuses records and clearing the 2020 public resolver predates",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const name = fixtures.byId("resolver.2020").name;

          for (const [records, feature] of [
            [{ data: { "eth.ens.example": "0x12" } }, "data records"],
            [{ clear: true }, "clearing records"],
          ] as const) {
            const error = yield* expectFailure(
              Actions.record.set.prepare(ens, { name, ...records }),
              unsupported,
            );
            assert.strictEqual(error.feature, feature);
          }
          // Profiles it declares still plan.
          yield* Actions.record.set.prepare(ens, { name, texts: { url: "https://2020.example" } });
        }),
      { meta: { cases: ["M:B2", "K31"] } },
    );

    it.effect(
      "record.set says a resolver keeps its records off-chain, however it refuses the write",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const account = devnet.accounts.alice;
          const wallet = (yield* Wallets).make(account);
          const ens = (yield* Clients).make({ account, wallet });
          const resolver = devnet.contract("mock.offchainWriter");
          const options = {
            name: fixtures.byId("records.v1").name,
            resolver,
            texts: { url: "https://offchain.example" },
          };

          // `OffchainWriteResolver.Mode`, and what each refusal says about where records live.
          for (const [mode, where] of [
            [0, "OffchainLookup"],
            [1, `${resolver} on chain 8453`],
            [2, "https://gateway.example/records"],
            [3, `${resolver} on chain 8453`],
            [4, "https://gateway.example/records"],
            [5, "extended resolver"],
          ] as const) {
            yield* chain.isolated(
              Effect.gen(function* () {
                yield* chain.write({
                  account,
                  address: resolver,
                  abi: parseAbi(["function setMode(uint8)"]),
                  functionName: "setMode",
                  args: [mode],
                });

                const error = yield* expectFailure(
                  Actions.record.setSync(ens, { ...options, onStep: chain.passWaits }),
                  unsupported,
                );
                assert.strictEqual(error.feature, "on-chain records");
                assert.include(error.details.join("\n"), where);
                assert.isFalse(wallet.prompted(), "refused before the wallet was asked");

                const simulation = yield* Actions.record.set.simulate(ens, options);
                assert.include(simulation.steps[0]?.error, unsupported);
              }),
            );
          }
        }),
      { meta: { cases: ["X16"] } },
    );

    it.effect("resolver.create refuses a salt whose resolver already exists", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const ens = (yield* Clients).make({ account: accounts.alice });
        const options = { name: fixtures.byId("v2.registered").name, salt: 31n };

        yield* chain.isolated(
          Effect.gen(function* () {
            const { resolver } = yield* Actions.resolver.createSync(ens, options);

            const error = yield* expectFailure(Actions.resolver.create.prepare(ens, options), {
              _tag: "InvalidInputError",
              code: "SALT_TAKEN",
            });
            assert.strictEqual(error.context.contract, resolver);
            assert.include(error.hint, "resolver.set");
          }),
        );
      }),
    );
  });
});
