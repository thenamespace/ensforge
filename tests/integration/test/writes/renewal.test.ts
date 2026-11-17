import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Duration, Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { isAddressEqual } from "viem";

import { Clients } from "../support/clients.ts";
import { ethEntry } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";

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

              const { plan } = yield* Actions.registration.renewSync(ens, {
                names: name,
                duration,
              });

              assert.isTrue(
                plan.calls.some((call) =>
                  isAddressEqual(call.to, devnet.contract("v2.ethRenewerV1")),
                ),
              );
              assert.strictEqual(yield* expires, before + duration);
            }),
          );
        }),
      { meta: { cases: ["G12", "O18"] } },
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

    it.effect("refuses names that cannot be renewed before the wallet is asked", () =>
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
      }),
    );
  });
});
