import { assert, describe } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";

import { Plan, type Write } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import type { Hex } from "viem";

import { ensforge, isolated, onProfile, passWaits } from "../support/chain.ts";
import { testWallet, type WalletOptions } from "../support/wallet.ts";
import { ethEntry } from "./support.ts";

const year = 31_536_000n;
const registration = { names: "qqqqq.eth", duration: year } as const;

const sends = (methods: readonly string[]) =>
  methods.filter((method) => method === "eth_sendTransaction").length;

/** Alice's client on `storage`, with a test wallet. */
const alice = (devnet: DevnetInstance, storage: Plan.Storage, wallet: WalletOptions = {}) => {
  const signer = testWallet(devnet, devnet.accounts.alice, wallet);
  return {
    ens: ensforge(devnet, { account: devnet.accounts.alice, wallet: signer, storage }),
    wallet: signer,
  };
};

/** The id of the one saved plan that did not complete (an interrupted plan is `failed`). */
const unfinishedId = (devnet: DevnetInstance, storage: Plan.Storage) =>
  Actions.plan.list(alice(devnet, storage).ens, {}).pipe(
    Effect.map((records) => {
      const unfinished = records.filter((record) => record.status !== "completed");
      assert.strictEqual(unfinished.length, 1);
      return unfinished[0]?.plan.id ?? "";
    }),
  );

describe("plan runtime", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "resumes an interrupted registration without committing again",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const storage = Plan.memoryStorage();

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              // The user signs the commit, then closes the reveal's prompt.
              const first = alice(devnet, storage, { rejectAfter: 1 });
              yield* expectFailure(
                Actions.registration.registerSync(first.ens, {
                  ...registration,
                  onStep: passWaits(devnet),
                }),
                { _tag: "UserRejectedError", code: "USER_REJECTED" },
              );
              const id = yield* unfinishedId(devnet, storage);
              const record = yield* Actions.plan.get(first.ens, { id });
              assert.deepStrictEqual(Object.keys(record?.submitted ?? {}), ["commit"]);

              const second = alice(devnet, storage);
              yield* Actions.plan.resumeSync(second.ens, { id, onStep: passWaits(devnet) });
              assert.strictEqual(sends(second.wallet.methods), 2, "approve and register only");
              assert.strictEqual((yield* ethEntry(devnet, "qqqqq")).owner, devnet.accounts.alice);
              assert.strictEqual(
                (yield* Actions.plan.get(second.ens, { id }))?.status,
                "completed",
              );
            }),
          );
        }),
      { meta: { cases: ["G20"] } },
    );

    it.effect(
      "confirms a submitted step on resume, and sends a dropped one again",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;

          for (const dropped of [false, true]) {
            const storage = Plan.memoryStorage();
            yield* isolated(
              devnet,
              Effect.gen(function* () {
                // The commit is submitted but never mined before the process stops.
                yield* Effect.promise(() => devnet.client.setAutomine(false));
                const submitted = yield* Deferred.make<Hex | undefined>();
                const first = alice(devnet, storage);
                const run = yield* Effect.forkChild(
                  Actions.registration.registerSync(first.ens, {
                    ...registration,
                    onStep: (event) => {
                      if (event.status === "submitted") {
                        Deferred.doneUnsafe(submitted, Effect.succeed(event.hashes?.[0]));
                      }
                    },
                  }),
                );
                const commit = yield* Deferred.await(submitted);
                yield* Fiber.interrupt(run);
                if (commit === undefined) return assert.fail("the commit was not submitted");
                if (dropped)
                  yield* Effect.promise(() => devnet.client.dropTransaction({ hash: commit }));
                yield* Effect.promise(() => devnet.client.setAutomine(true));

                const id = yield* unfinishedId(devnet, storage);
                const second = alice(devnet, storage);
                yield* Actions.plan.resumeSync(second.ens, { id, onStep: passWaits(devnet) });
                // approve + register, and the commit again only when it was dropped.
                assert.strictEqual(
                  sends(second.wallet.methods),
                  dropped ? 3 : 2,
                  `dropped: ${dropped}`,
                );
                assert.strictEqual((yield* ethEntry(devnet, "qqqqq")).owner, devnet.accounts.alice);
              }),
            );
          }
        }),
      { meta: { cases: ["G20"] } },
    );

    it.effect("records a transaction the user replaced, and resumes from it", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const storage = Plan.memoryStorage();

        yield* isolated(
          devnet,
          Effect.gen(function* () {
            yield* Effect.promise(() => devnet.client.setAutomine(false));
            // @effect-diagnostics-next-line abortControllerInEffect:off
            const controller = new AbortController();
            let commit: Hex | undefined;
            const first = alice(devnet, storage);
            yield* Effect.promise(() =>
              first.ens.registration
                .registerSync({
                  ...registration,
                  signal: controller.signal,
                  onStep: (event) => {
                    if (event.status !== "submitted") return;
                    commit = event.hashes?.[0];
                    controller.abort();
                  },
                })
                .catch(() => undefined),
            );
            if (commit === undefined) return assert.fail("the commit was not submitted");
            // The user's wallet sped the commit up: same call, new transaction.
            const original = yield* Effect.promise(() =>
              devnet.client.getTransaction({ hash: commit as Hex }),
            );
            yield* Effect.promise(() => devnet.client.dropTransaction({ hash: commit as Hex }));
            yield* Effect.promise(() => devnet.client.setAutomine(true));
            const replacement = yield* Effect.promise(() =>
              devnet.client.sendTransaction({
                account: devnet.accounts.alice,
                chain: devnet.chain,
                to: original.to ?? undefined,
                data: original.input,
              }),
            );
            yield* Effect.promise(() =>
              devnet.client.waitForTransactionReceipt({ hash: replacement }),
            );

            const id = yield* unfinishedId(devnet, storage);
            const reconciled = yield* Actions.plan.reconcile(first.ens, {
              id,
              step: "commit",
              hash: replacement,
            });
            assert.deepStrictEqual(reconciled.submitted["commit"], [replacement]);

            const second = alice(devnet, storage);
            yield* Actions.plan.resumeSync(second.ens, { id, onStep: passWaits(devnet) });
            assert.strictEqual(sends(second.wallet.methods), 2);
          }),
        );
      }),
    );

    it.effect(
      "re-validates a plan prepared before its name changed",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { carol, user } = devnet.accounts;
          const name = fixtures.byId("v2.registered").name;
          const storage = Plan.memoryStorage();

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const { ens, wallet } = alice(devnet, storage);
              const plan = yield* Actions.name.transfer.prepare(ens, { name, to: carol });
              // The name moves on before the prepared plan is sent.
              yield* Actions.name.transferSync(ens, { name, to: user });
              const before = sends(wallet.methods);

              yield* expectFailure(Actions.plan.send(ens, { plan }), { _tag: "UnauthorizedError" });
              assert.strictEqual(sends(wallet.methods), before, "nothing sent");
            }),
          );
        }),
      { meta: { cases: ["T16", "M:E5"] } },
    );

    it.effect("reports each step as it waits, is submitted and is confirmed", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const storage = Plan.memoryStorage();

        yield* isolated(
          devnet,
          Effect.gen(function* () {
            const events: string[] = [];
            const advance = passWaits(devnet);
            yield* Actions.registration.registerSync(alice(devnet, storage).ens, {
              ...registration,
              onStep: (event) => {
                events.push(`${event.step.id}:${event.status}`);
                advance(event);
              },
            });
            assert.deepStrictEqual(events, [
              "commit:submitted",
              "commit:confirmed",
              "register:waiting",
              "register:submitted",
              "register:confirmed",
            ]);
          }),
        );
      }),
    );

    it.effect("resumes a routed plan only through its route", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const storage = Plan.memoryStorage();

        // A route that sends each step's calls as the signer's transactions; it can go down.
        let down = false;
        const route: Write.Via = {
          id: "test-route",
          send: async (step) => {
            if (down && step.id === "register") throw new Error("route down");
            // Each call is mined before the next, as the signer's own transactions would be.
            const hashes = await step.calls.reduce<Promise<readonly Hex[]>>(async (sent, item) => {
              const done = await sent;
              const hash = await devnet.client.sendTransaction({
                account: devnet.accounts.alice,
                chain: devnet.chain,
                to: item.to,
                data: item.data,
                value: item.value,
              });
              await devnet.client.waitForTransactionReceipt({ hash });
              return [...done, hash];
            }, Promise.resolve([]));
            const last = hashes.at(-1);
            if (last === undefined) throw new Error("empty step");
            return last;
          },
          status: async (reference) => {
            const receipt = await devnet.client.waitForTransactionReceipt({
              hash: reference as Hex,
            });
            return receipt.status === "success"
              ? { status: "success", hashes: [receipt.transactionHash] }
              : { status: "failed", reason: "reverted" };
          },
        };

        yield* isolated(
          devnet,
          Effect.gen(function* () {
            const { ens } = alice(devnet, storage);
            down = true;
            yield* Effect.promise(() =>
              ens.registration
                .registerSync({ ...registration, via: route, onStep: passWaits(devnet) })
                .catch(() => undefined),
            );
            const id = yield* unfinishedId(devnet, storage);

            // Sent through the route, the commit is only known to it.
            yield* expectFailure(Actions.plan.resume(ens, { id }), {
              _tag: "PlanError",
              code: "PLAN_ROUTE_REQUIRED",
            });
            down = false;
            yield* Actions.plan.resumeSync(ens, { id, via: route, onStep: passWaits(devnet) });
            assert.strictEqual((yield* ethEntry(devnet, "qqqqq")).owner, devnet.accounts.alice);
          }),
        );
      }),
    );
  });
});
