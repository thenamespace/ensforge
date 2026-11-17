import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { pad, toHex } from "viem";

import { Clients } from "../support/clients.ts";
import { ethEntry, usdcOf } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";

describe("registration", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "registers a name through commit, wait and reveal, paying the quote",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          // Carol has not approved the registrar: the plan approves first.
          const ens = clients.make({ account: accounts.carol });
          const duration = Duration.years(1);

          yield* chain.isolated(
            Effect.gen(function* () {
              const quote = yield* Actions.registration.getPrice(ens, {
                name: "qqqqq.eth",
                duration,
              });
              const before = yield* usdcOf(accounts.carol);

              const result = yield* Actions.registration.registerSync(ens, {
                names: "qqqqq.eth",
                duration,
                onStep: chain.passWaits,
              });

              const entry = yield* ethEntry("qqqqq.eth");
              assert.strictEqual(entry.owner, accounts.carol);
              assert.strictEqual(entry.expiry, result.names[0]?.expiry);
              assert.strictEqual(result.paid, quote.total);
              assert.strictEqual(before - (yield* usdcOf(accounts.carol)), result.paid);
            }),
          );
        }),
      { meta: { cases: ["G17", "M:A14"] } },
    );

    it.effect(
      "registers from an earlier commitment only inside its window",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const options = { names: "qqqqq.eth", duration: Duration.years(1) } as const;

          yield* chain.isolated(
            Effect.gen(function* () {
              const { secret, readyAt } = yield* Actions.registration.commitSync(ens, options);
              yield* expectFailure(Actions.registration.registerSync(ens, { ...options, secret }), {
                _tag: "CommitmentError",
                code: "COMMITMENT_TOO_NEW",
              });

              const parameters = yield* Actions.registration.getParameters(ens);
              const expiresAt = readyAt - parameters.minCommitmentAge + parameters.maxCommitmentAge;
              yield* chain.atTimestamp(
                expiresAt,
                expectFailure(Actions.registration.registerSync(ens, { ...options, secret }), {
                  _tag: "CommitmentError",
                  code: "COMMITMENT_TOO_OLD",
                }),
              );

              yield* chain.atTimestamp(
                readyAt,
                Effect.gen(function* () {
                  const result = yield* Actions.registration.registerSync(ens, {
                    ...options,
                    secret,
                  });

                  // Only the reveal is left to send.
                  assert.deepStrictEqual(
                    result.plan.steps.map((step) => step.id),
                    ["register"],
                  );
                  assert.strictEqual((yield* ethEntry("qqqqq.eth")).owner, accounts.alice);
                }),
              );
            }),
          );
        }),
      { meta: { cases: ["G06", "G20", "G21"] } },
    );

    it.effect(
      "sets records, a primary name and a referrer while registering",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const referrer = pad(toHex("ensforge"), { dir: "right" });

          const plan = yield* Actions.registration.register.prepare(ens, {
            names: "qqqqq.eth",
            duration: Duration.years(1),
            referrer,
          });
          assert.isTrue(
            plan.steps.some((step) =>
              step.calls.some((call) => call.data.includes(referrer.slice(2))),
            ),
            "referrer in the calldata",
          );

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.registration.registerSync(ens, {
                names: "qqqqq.eth",
                duration: Duration.years(1),
                records: {
                  texts: { url: "https://new.example" },
                  addresses: { eth: accounts.alice },
                },
                primaryName: true,
                onStep: chain.passWaits,
              });

              assert.strictEqual(
                yield* Actions.record.getText(ens, { name: "qqqqq.eth", key: "url" }),
                "https://new.example",
              );
              assert.strictEqual(
                yield* Actions.primaryName.get(ens, { address: accounts.alice }),
                "qqqqq.eth",
              );
            }),
          );
        }),
      { meta: { cases: ["G25", "P26"] } },
    );

    it.effect(
      "registers several names, each at its price tier",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const names = ["qqq.eth", "qqqqq.eth"];
          const duration = Duration.years(1);

          yield* chain.isolated(
            Effect.gen(function* () {
              const quotes = yield* Effect.forEach(names, (name) =>
                Actions.registration.getPrice(ens, { name, duration }),
              );

              const result = yield* Actions.registration.registerSync(ens, {
                names,
                duration,
                onStep: chain.passWaits,
              });

              assert.deepStrictEqual(
                result.names.map(({ name }) => name),
                names,
              );
              assert.strictEqual(
                result.paid,
                quotes.reduce((sum, quote) => sum + quote.total, 0n),
              );
              for (const name of names) {
                assert.strictEqual((yield* ethEntry(name)).owner, accounts.alice);
              }
            }),
          );
        }),
      { meta: { cases: ["M:C9"] } },
    );

    it.effect(
      "re-registers an expired name as a new token, without the old roles",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const expired = (yield* Fixtures).byId("v2.expired");
          const ens = clients.make({ account: accounts.bob });

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.registration.registerSync(ens, {
                names: expired.name,
                duration: Duration.years(1),
                onStep: chain.passWaits,
              });

              const entry = yield* ethEntry(expired.name);
              assert.strictEqual(entry.owner, accounts.bob);
              assert.notStrictEqual(entry.tokenId, BigInt(String(expired.facts["tokenId"])));
              const former = yield* Actions.role.get(ens, {
                account: accounts.alice,
                target: "registry",
                name: expired.name,
              });
              assert.deepStrictEqual(former.names, []);
            }),
          );
        }),
      { meta: { cases: ["O17", "M:A17"] } },
    );

    it.effect(
      "pays the premium of a recently released name",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const released = (yield* Fixtures).byId("registration.v2-premium").name;
          const ens = clients.make({ account: accounts.alice });
          const duration = Duration.years(1);

          yield* chain.isolated(
            Effect.gen(function* () {
              const quote = yield* Actions.registration.getPrice(ens, { name: released, duration });
              assert.isTrue(quote.premium > 0n);

              const result = yield* Actions.registration.registerSync(ens, {
                names: released,
                duration,
                onStep: chain.passWaits,
              });

              // The premium decays every second between the quote and the reveal.
              assert.isTrue(result.paid > quote.base && result.paid <= quote.total);
            }),
          );
        }),
      { meta: { cases: ["G14"] } },
    );

    it.effect("refuses names that cannot be registered before the wallet is asked", () =>
      Effect.gen(function* () {
        const { accounts } = yield* Devnet;
        const clients = yield* Clients;
        const fixtures = yield* Fixtures;
        const ens = clients.make({ account: accounts.alice });

        yield* expectFailure(
          Actions.registration.register(ens, {
            names: fixtures.byId("v2.registered").name,
            duration: Duration.years(1),
          }),
          { _tag: "NameStateError", code: "NAME_NOT_AVAILABLE" },
        );
        yield* expectFailure(
          Actions.registration.register(ens, { names: "qqqqq.eth", duration: Duration.days(1) }),
          { _tag: "InvalidInputError", code: "DURATION_TOO_SHORT" },
        );
        yield* expectFailure(
          Actions.registration.register(ens, { names: "qq.eth", duration: Duration.years(1) }),
          { _tag: "InvalidInputError", code: "INVALID_NAME" },
        );
      }),
    );
  });
});
