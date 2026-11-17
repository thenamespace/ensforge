import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { pad, toHex } from "viem";

import { atTimestamp, ensforge, isolated, onProfile, passWaits } from "../support/chain.ts";
import { ethEntry, usdcOf } from "./support.ts";

const year = 31_536_000n;

describe("registration", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "registers a name through commit, wait and reveal, paying the quote",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const { carol } = devnet.accounts;
          // Carol has not approved the registrar: the plan approves first.
          const ens = ensforge(devnet, { account: carol });

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const quote = yield* Actions.registration.getPrice(ens, {
                name: "qqqqq.eth",
                duration: year,
              });
              const before = yield* usdcOf(devnet, carol);
              const result = yield* Actions.registration.registerSync(ens, {
                names: "qqqqq.eth",
                duration: year,
                onStep: passWaits(devnet),
              });
              const entry = yield* ethEntry(devnet, "qqqqq");

              assert.strictEqual(entry.owner, carol);
              assert.strictEqual(entry.expiry, result.names[0]?.expiry);
              assert.strictEqual(result.paid, quote.total);
              assert.strictEqual(before - (yield* usdcOf(devnet, carol)), result.paid);
            }),
          );
        }),
      { meta: { cases: ["G17", "M:A14"] } },
    );

    it.effect(
      "registers from an earlier commitment only inside its window",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const ens = ensforge(devnet, { account: devnet.accounts.alice });
          const options = { names: "qqqqq.eth", duration: year } as const;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const { secret, readyAt } = yield* Actions.registration.commitSync(ens, options);
              yield* expectFailure(Actions.registration.registerSync(ens, { ...options, secret }), {
                _tag: "CommitmentError",
                code: "COMMITMENT_TOO_NEW",
              });
              const parameters = yield* Actions.registration.getParameters(ens);
              const expiresAt = readyAt - parameters.minCommitmentAge + parameters.maxCommitmentAge;

              yield* atTimestamp(
                devnet,
                expiresAt,
                expectFailure(Actions.registration.registerSync(ens, { ...options, secret }), {
                  _tag: "CommitmentError",
                  code: "COMMITMENT_TOO_OLD",
                }),
              );
              yield* atTimestamp(
                devnet,
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
                  assert.strictEqual(
                    (yield* ethEntry(devnet, "qqqqq")).owner,
                    devnet.accounts.alice,
                  );
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
          const devnet = yield* Devnet;
          const { alice } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const referrer = pad(toHex("ensforge"), { dir: "right" });

          const plan = yield* Actions.registration.register.prepare(ens, {
            names: "qqqqq.eth",
            duration: year,
            referrer,
          });
          assert.isTrue(
            plan.steps.some((step) =>
              step.calls.some((item) => item.data.includes(referrer.slice(2))),
            ),
            "referrer in the calldata",
          );

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.registration.registerSync(ens, {
                names: "qqqqq.eth",
                duration: year,
                records: { texts: { url: "https://new.example" }, addresses: { eth: alice } },
                primaryName: true,
                onStep: passWaits(devnet),
              });
              assert.strictEqual(
                yield* Actions.record.getText(ens, { name: "qqqqq.eth", key: "url" }),
                "https://new.example",
              );
              assert.strictEqual(
                yield* Actions.primaryName.get(ens, { address: alice }),
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
          const devnet = yield* Devnet;
          const ens = ensforge(devnet, { account: devnet.accounts.alice });
          const names = ["qqq.eth", "qqqqq.eth"];

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const quotes = yield* Effect.forEach(names, (name) =>
                Actions.registration.getPrice(ens, { name, duration: year }),
              );
              const result = yield* Actions.registration.registerSync(ens, {
                names,
                duration: year,
                onStep: passWaits(devnet),
              });
              assert.deepStrictEqual(
                result.names.map(({ name }) => name),
                names,
              );
              assert.strictEqual(
                result.paid,
                quotes.reduce((sum, quote) => sum + quote.total, 0n),
              );
              for (const label of ["qqq", "qqqqq"]) {
                assert.strictEqual((yield* ethEntry(devnet, label)).owner, devnet.accounts.alice);
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
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice, bob } = devnet.accounts;
          const expired = fixtures.byId("v2.expired");
          const ens = ensforge(devnet, { account: bob });

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.registration.registerSync(ens, {
                names: expired.name,
                duration: year,
                onStep: passWaits(devnet),
              });
              const entry = yield* ethEntry(devnet, expired.name.slice(0, -".eth".length));
              assert.strictEqual(entry.owner, bob);
              assert.notStrictEqual(entry.tokenId, BigInt(String(expired.facts["tokenId"])));
              const former = yield* Actions.role.get(ens, {
                account: alice,
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
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const released = fixtures.byId("registration.v2-premium").name;
          const ens = ensforge(devnet, { account: devnet.accounts.alice });

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const quote = yield* Actions.registration.getPrice(ens, {
                name: released,
                duration: year,
              });
              assert.isTrue(quote.premium > 0n);
              const result = yield* Actions.registration.registerSync(ens, {
                names: released,
                duration: year,
                onStep: passWaits(devnet),
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
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const ens = ensforge(devnet, { account: devnet.accounts.alice });

        yield* expectFailure(
          Actions.registration.register(ens, {
            names: fixtures.byId("v2.registered").name,
            duration: year,
          }),
          { _tag: "NameStateError", code: "NAME_NOT_AVAILABLE" },
        );
        yield* expectFailure(
          Actions.registration.register(ens, { names: "qqqqq.eth", duration: 86_400n }),
          {
            _tag: "InvalidInputError",
            code: "DURATION_TOO_SHORT",
          },
        );
        yield* expectFailure(
          Actions.registration.register(ens, { names: "qq.eth", duration: year }),
          {
            _tag: "InvalidInputError",
            code: "INVALID_NAME",
          },
        );
      }),
    );
  });
});
