import { assert, describe } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Array as Arr, Record as Rec } from "effect";

import { Duration, Plan, type Write } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { isHex, type Hex } from "viem";

import { Clients, type Client } from "../support/clients.ts";
import { ethEntry } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

/** The id of the one saved plan that did not complete (an interrupted plan is `failed`). */
const unfinishedId = (ens: Client) =>
  Actions.plan.list(ens, {}).pipe(
    Effect.map((records) => {
      const unfinished = Arr.filter(records, (record) => record.status !== "completed");
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
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const wallets = yield* Wallets;
          const storage = Plan.memoryStorage();
          const options = { names: "qqqqq.eth", duration: Duration.years(1) } as const;

          yield* chain.isolated(
            Effect.gen(function* () {
              // The user signs the commit, then closes the reveal's prompt.
              const first = clients.make({
                account: accounts.alice,
                wallet: wallets.make(accounts.alice, { rejectAfter: 1 }),
                storage,
              });
              yield* expectFailure(
                Actions.registration.registerSync(first, { ...options, onStep: chain.passWaits }),
                { _tag: "UserRejectedError", code: "USER_REJECTED" },
              );
              const id = yield* unfinishedId(first);
              const record = yield* Actions.plan.get(first, { id });
              assert.deepStrictEqual(Rec.keys(record?.submitted ?? {}), ["commit"]);

              const wallet = wallets.make(accounts.alice);
              const second = clients.make({ account: accounts.alice, wallet, storage });
              yield* Actions.plan.resumeSync(second, { id, onStep: chain.passWaits });

              assert.strictEqual(
                Arr.filter(wallet.methods, (method) => method === "eth_sendTransaction").length,
                2,
                "approve and register only",
              );
              assert.strictEqual((yield* ethEntry("qqqqq.eth")).owner, accounts.alice);
              assert.strictEqual((yield* Actions.plan.get(second, { id }))?.status, "completed");
            }),
          );
        }),
      { meta: { cases: ["G20"] } },
    );

    it.effect(
      "confirms a submitted step on resume, and sends a dropped one again",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const wallets = yield* Wallets;

          for (const dropped of [false, true]) {
            const storage = Plan.memoryStorage();
            yield* chain.isolated(
              Effect.gen(function* () {
                // The commit is submitted but never mined before the process stops.
                yield* chain.setAutomine(false);
                const submitted = yield* Deferred.make<Hex | undefined>();
                const first = clients.make({
                  account: accounts.alice,
                  wallet: wallets.make(accounts.alice),
                  storage,
                });
                const run = yield* Effect.forkChild(
                  Actions.registration.registerSync(first, {
                    names: "qqqqq.eth",
                    duration: Duration.years(1),
                    onStep: (event) => {
                      if (event.status === "submitted") {
                        Deferred.doneUnsafe(submitted, Effect.succeed(event.hashes?.[0]));
                      }
                    },
                  }),
                );
                const commit = yield* Deferred.await(submitted);
                yield* Fiber.interrupt(run);
                if (commit === undefined) assert.fail("the commit was not submitted");
                if (dropped) yield* chain.dropTransaction(commit);
                yield* chain.setAutomine(true);

                const id = yield* unfinishedId(first);
                const wallet = wallets.make(accounts.alice);
                const second = clients.make({ account: accounts.alice, wallet, storage });
                yield* Actions.plan.resumeSync(second, { id, onStep: chain.passWaits });

                // approve + register, and the commit again only when it was dropped.
                assert.strictEqual(
                  Arr.filter(wallet.methods, (method) => method === "eth_sendTransaction").length,
                  dropped ? 3 : 2,
                  `dropped: ${dropped}`,
                );
                assert.strictEqual((yield* ethEntry("qqqqq.eth")).owner, accounts.alice);
              }),
            );
          }
        }),
      { meta: { cases: ["G20"] } },
    );

    it.effect("records a transaction the user replaced, and resumes from it", () =>
      Effect.gen(function* () {
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const wallets = yield* Wallets;
        const storage = Plan.memoryStorage();

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* chain.setAutomine(false);
            const submitted = yield* Deferred.make<Hex | undefined>();
            const first = clients.make({
              account: accounts.alice,
              wallet: wallets.make(accounts.alice),
              storage,
            });
            const run = yield* Effect.forkChild(
              Actions.registration.registerSync(first, {
                names: "qqqqq.eth",
                duration: Duration.years(1),
                onStep: (event) => {
                  if (event.status === "submitted") {
                    Deferred.doneUnsafe(submitted, Effect.succeed(event.hashes?.[0]));
                  }
                },
              }),
            );
            const commit = yield* Deferred.await(submitted);
            yield* Fiber.interrupt(run);
            if (commit === undefined) assert.fail("the commit was not submitted");

            // The user's wallet sped the commit up: same call, new transaction.
            const original = yield* chain.transaction(commit);
            yield* chain.dropTransaction(commit);
            yield* chain.setAutomine(true);
            const replacement = yield* chain.send({
              account: accounts.alice,
              chain: null,
              to: original.to,
              data: original.input,
            });

            const id = yield* unfinishedId(first);
            const reconciled = yield* Actions.plan.reconcile(first, {
              id,
              step: "commit",
              hash: replacement.transactionHash,
            });
            assert.deepStrictEqual(reconciled.submitted["commit"], [replacement.transactionHash]);

            const wallet = wallets.make(accounts.alice);
            const second = clients.make({ account: accounts.alice, wallet, storage });
            yield* Actions.plan.resumeSync(second, { id, onStep: chain.passWaits });
            assert.strictEqual(
              Arr.filter(wallet.methods, (method) => method === "eth_sendTransaction").length,
              2,
            );
          }),
        );
      }),
    );

    it.effect(
      "re-validates a plan prepared before its name changed",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const wallets = yield* Wallets;
          const { name } = (yield* Fixtures).byId("v2.registered");
          const wallet = wallets.make(accounts.alice);
          const ens = clients.make({ account: accounts.alice, wallet });

          yield* chain.isolated(
            Effect.gen(function* () {
              const plan = yield* Actions.name.transfer.prepare(ens, { name, to: accounts.carol });
              // The name moves on before the prepared plan is sent.
              yield* Actions.name.transferSync(ens, { name, to: accounts.user });
              const sent = wallet.methods.length;

              yield* expectFailure(Actions.plan.send(ens, { plan }), { _tag: "UnauthorizedError" });
              assert.isFalse(
                wallet.methods.slice(sent).includes("eth_sendTransaction"),
                "nothing sent",
              );
            }),
          );
        }),
      { meta: { cases: ["T16", "M:E5"] } },
    );

    it.effect("reports each step as it waits, is submitted and is confirmed", () =>
      Effect.gen(function* () {
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const ens = clients.make({ account: accounts.alice });

        yield* chain.isolated(
          Effect.gen(function* () {
            const events: string[] = [];
            yield* Actions.registration.registerSync(ens, {
              names: "qqqqq.eth",
              duration: Duration.years(1),
              onStep: (event) => {
                events.push(`${event.step.id}:${event.status}`);
                chain.passWaits(event);
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
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const ens = clients.make({ account: accounts.alice, storage: Plan.memoryStorage() });
        const options = { names: "qqqqq.eth", duration: Duration.years(1) } as const;

        const context = yield* Effect.context();
        const run = Effect.runPromiseWith(context);

        // A route that sends each step's calls as the signer's own transactions, each mined before
        // the next; it can go down. Routes are called through Promises, the SDK's adapter boundary.
        let down = false;
        const route: Write.Via = {
          id: "test-route",
          send: (step) =>
            run(
              Effect.gen(function* () {
                if (down && step.id === "register") return yield* Effect.die("route down");
                const receipts = yield* Effect.forEach(
                  step.calls,
                  (call) =>
                    chain.send({
                      account: accounts.alice,
                      chain: null,
                      to: call.to,
                      data: call.data,
                      value: call.value,
                    }),
                  { concurrency: 1 },
                );
                const last = receipts.at(-1);
                if (last === undefined) return yield* Effect.die("empty step");
                return last.transactionHash;
              }),
            ),
          status: (reference) =>
            run(
              Effect.suspend(() =>
                isHex(reference)
                  ? chain.receipt(reference)
                  : Effect.die(`${reference} is not a transaction hash`),
              ).pipe(
                Effect.map((receipt) =>
                  receipt.status === "success"
                    ? { status: "success" as const, hashes: [receipt.transactionHash] }
                    : { status: "failed" as const, reason: "reverted" },
                ),
              ),
            ),
        };

        yield* chain.isolated(
          Effect.gen(function* () {
            down = true;
            const failed = yield* Effect.exit(
              Actions.registration.registerSync(ens, {
                ...options,
                via: route,
                onStep: chain.passWaits,
              }),
            );
            assert.isTrue(Exit.isFailure(failed));
            const id = yield* unfinishedId(ens);

            // Sent through the route, the commit is only known to it.
            yield* expectFailure(Actions.plan.resume(ens, { id }), {
              _tag: "PlanError",
              code: "PLAN_ROUTE_REQUIRED",
            });
            down = false;
            yield* Actions.plan.resumeSync(ens, { id, via: route, onStep: chain.passWaits });
            assert.strictEqual((yield* ethEntry("qqqqq.eth")).owner, accounts.alice);
          }),
        );
      }),
    );
  });
});
