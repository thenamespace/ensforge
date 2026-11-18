import { assert, describe } from "@effect/vitest";
import { Effect, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { Duration, Name, Plan } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { erc20Abi, isAddressEqual } from "viem";

import { Clients } from "../support/clients.ts";
import { ethEntry, usdcOf, v1Owners } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

describe("renewal", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "renews an ENSv2 name for anyone who pays, in grace from its old expiry",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const fixtures = yield* Fixtures;
          // Carol renews names that are not hers.
          const ens = clients.make({ account: accounts.carol });
          const duration = Duration.years(1);

          for (const id of ["v2.registered", "v2.grace"]) {
            const { name, facts } = fixtures.byId(id);
            yield* chain.isolated(
              Effect.gen(function* () {
                const before = yield* ethEntry(name);
                const quote = yield* Actions.registration.getRenewalPrice(ens, {
                  names: name,
                  duration,
                });

                const result = yield* Actions.registration.renewSync(ens, {
                  names: name,
                  duration,
                });

                const after = yield* ethEntry(name);
                assert.strictEqual(after.expiry, before.expiry + duration, id);
                assert.strictEqual(result.paid, quote.total, id);
                // A name in grace has no owner until it is renewed.
                assert.strictEqual(after.owner, facts["owner"], id);
              }),
            );
          }
        }),
      { meta: { cases: ["G24", "T09", "M:A15"] } },
    );

    it.effect(
      "renews a premigrated ENSv1 name through ETHRenewerV1",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { name } = (yield* Fixtures).byId("v2.reserved");
          const ens = clients.make({ account: devnet.accounts.alice });
          const duration = Duration.years(1);
          const expires = chain.read({
            address: devnet.contract("v1.baseRegistrar"),
            abi: Abis.v1.baseRegistrar,
            functionName: "nameExpires",
            args: [Name.toTokenId(name)],
          });

          yield* chain.isolated(
            Effect.gen(function* () {
              const before = yield* expires;
              const wrapperBefore = (yield* v1Owners(name)).wrapped;

              const { plan } = yield* Actions.registration.renewSync(ens, {
                names: name,
                duration,
              });

              assert.isTrue(
                Arr.some(plan.calls, (call) =>
                  isAddressEqual(call.to, devnet.contract("v2.ethRenewerV1")),
                ),
              );
              const expiryAfterRenewal = yield* expires;
              assert.strictEqual(expiryAfterRenewal, before + duration);
              // An unwrapped name's renewal leaves the NameWrapper's entry for it as it was.
              assert.deepStrictEqual((yield* v1Owners(name)).wrapped, wrapperBefore);
            }),
          );
        }),
      { meta: { cases: ["G12", "G13", "O18"] } },
    );

    it.effect(
      "renews a name listed twice once",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { name } = (yield* Fixtures).byId("v2.registered");
          const ens = clients.make({ account: accounts.alice });
          const duration = Duration.years(1);

          yield* chain.isolated(
            Effect.gen(function* () {
              const before = yield* ethEntry(name);
              const once = yield* Actions.registration.getRenewalPrice(ens, {
                names: name,
                duration,
              });

              const result = yield* Actions.registration.renewSync(ens, {
                names: [name, name],
                duration,
              });

              // On chain the durations would stack; ensforge drops the duplicate.
              assert.strictEqual((yield* ethEntry(name)).expiry, before.expiry + duration);
              assert.strictEqual(result.paid, once.total);
            }),
          );
        }),
      { meta: { cases: ["G10"] } },
    );

    it.effect(
      "resumes a bulk renewal the user stopped after approving, charging once",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const { accounts } = devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const wallets = yield* Wallets;
          const fixtures = yield* Fixtures;
          const names = [fixtures.byId("v2.registered").name, fixtures.byId("v2.grace").name];
          const duration = Duration.years(1);
          const storage = Plan.memoryStorage();

          yield* chain.isolated(
            Effect.gen(function* () {
              // Without an allowance, the renewal plan approves the registrar first.
              yield* chain.write({
                address: devnet.contract("v2.usdc"),
                abi: erc20Abi,
                functionName: "approve",
                args: [devnet.contract("v2.ethRegistrar"), 0n],
                account: accounts.carol,
              });
              const before = yield* Effect.forEach(names, (name) => ethEntry(name), {
                concurrency: 1,
              });
              const balance = yield* usdcOf(accounts.carol);
              const quote = yield* Actions.registration.getRenewalPrice(clients.reader, {
                names,
                duration,
              });

              // Carol signs the approval, then closes the renewal's prompt.
              const first = clients.make({
                account: accounts.carol,
                wallet: wallets.make(accounts.carol, { rejectAfter: 1 }),
                storage,
              });
              yield* expectFailure(Actions.registration.renewSync(first, { names, duration }), {
                _tag: "UserRejectedError",
                code: "USER_REJECTED",
              });
              const [record] = yield* Actions.plan.list(first, {});
              if (record === undefined) assert.fail("the plan was not saved");

              const wallet = wallets.make(accounts.carol);
              const second = clients.make({ account: accounts.carol, wallet, storage });
              yield* Actions.plan.resumeSync(second, { id: record.plan.id });

              assert.strictEqual(
                Arr.filter(wallet.methods, (method) => method === "eth_sendTransaction").length,
                1,
                "the renewal only",
              );
              const after = yield* Effect.forEach(names, (name) => ethEntry(name), {
                concurrency: 1,
              });
              assert.deepStrictEqual(
                Arr.map(after, (entry) => entry.expiry),
                Arr.map(before, (entry) => entry.expiry + duration),
              );
              assert.strictEqual(balance - (yield* usdcOf(accounts.carol)), quote.total);
            }),
          );
        }),
      { meta: { cases: ["A05"] } },
    );

    it.effect(
      "renews an ENSv2 name until its grace period ends",
      () =>
        Effect.gen(function* () {
          const chain = yield* Chain;
          const { accounts } = yield* Devnet;
          const clients = yield* Clients;
          const { name, facts } = (yield* Fixtures).byId("v2.registered");
          const ens = clients.make({ account: accounts.alice });
          const graceEnd = BigInt(String(facts["expiry"])) + Duration.days(28);
          const options = { names: name, duration: Duration.years(1) };

          // Plans are simulated in a block 12 seconds on (`eth_simulateV1`), as mainnet mines them.
          yield* chain.atTimestamp(
            graceEnd - 13n,
            Effect.gen(function* () {
              yield* Actions.registration.renewSync(ens, options);
              assert.strictEqual(
                (yield* ethEntry(name)).expiry,
                BigInt(String(facts["expiry"])) + options.duration,
              );
            }),
          );
          yield* chain.atTimestamp(
            graceEnd,
            expectFailure(Actions.registration.renew(ens, options), {
              _tag: "NameStateError",
              code: "NAME_NOT_RENEWABLE",
            }),
          );
        }),
      { meta: { cases: ["G11"] } },
    );

    it.effect(
      "refuses names that cannot be renewed before the wallet is asked",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const clients = yield* Clients;
          const fixtures = yield* Fixtures;
          const ens = clients.make({ account: accounts.alice });

          for (const id of ["v2.expired", "v1.unwrapped"]) {
            yield* expectFailure(
              Actions.registration.renew(ens, {
                names: fixtures.byId(id).name,
                duration: Duration.years(1),
              }),
              { _tag: "NameStateError", code: "NAME_NOT_RENEWABLE" },
            );
          }
          // One name that does not exist fails the whole list.
          yield* expectFailure(
            Actions.registration.renew(ens, {
              names: [fixtures.byId("v2.registered").name, "never-registered.eth"],
              duration: Duration.years(1),
            }),
            { _tag: "NameStateError", code: "NAME_NOT_RENEWABLE" },
          );
          // ENSv2 renews for any positive duration (MIN_RENEW_DURATION is one second).
          yield* Actions.registration.renew.prepare(ens, {
            names: fixtures.byId("v2.registered").name,
            duration: Duration.days(1),
          });
          yield* expectFailure(
            Actions.registration.renew(ens, {
              names: fixtures.byId("v2.registered").name,
              duration: 0n,
            }),
            { _tag: "InvalidInputError", code: "DURATION_TOO_SHORT" },
          );
        }),
      { meta: { cases: ["G09", "G23"] } },
    );
  });
});
