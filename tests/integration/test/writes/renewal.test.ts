import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection } from "@ensforge/test-harness";
import { labelhash, type Address } from "viem";

import { call, ensforge, isolated, onProfile } from "../support/chain.ts";
import { ethEntry } from "./support.ts";

const year = 31_536_000n;
const labelOf = (name: string) => name.slice(0, -".eth".length);

describe("renewal", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "renews an ENSv2 name for anyone who pays, in grace from its old expiry",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          // Carol renews names that are not hers.
          const ens = ensforge(devnet, { account: devnet.accounts.carol });

          for (const id of ["v2.registered", "v2.grace"]) {
            const name = fixtures.byId(id).name;
            yield* isolated(
              devnet,
              Effect.gen(function* () {
                const before = yield* ethEntry(devnet, labelOf(name));
                const quote = yield* call(() =>
                  ens.registration.getRenewalPrice({ names: name, duration: year }),
                );
                const result = yield* call(() =>
                  ens.registration.renewSync({ names: name, duration: year }),
                );
                const after = yield* ethEntry(devnet, labelOf(name));

                assert.strictEqual(after.expiry, before.expiry + year, id);
                assert.strictEqual(result.paid, quote.total, id);
                // A name in grace has no owner until it is renewed.
                assert.strictEqual(after.owner, fixtures.byId(id).facts["owner"], id);
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
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const ens = ensforge(devnet, { account: devnet.accounts.alice });
          const name = fixtures.byId("v2.reserved").name;
          const expires = () =>
            Effect.promise(() =>
              devnet.client.readContract({
                address: devnet.contracts["v1.baseRegistrar"] as Address,
                abi: Abis.v1.baseRegistrar,
                functionName: "nameExpires",
                args: [BigInt(labelhash(labelOf(name)))],
              }),
            );

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const before = yield* expires();
              const { plan } = yield* call(() =>
                ens.registration.renewSync({ names: name, duration: year }),
              );
              assert.isTrue(
                plan.calls.some(
                  (item) =>
                    item.to.toLowerCase() === devnet.contracts["v2.ethRenewerV1"]?.toLowerCase(),
                ),
              );
              assert.strictEqual(yield* expires(), before + year);
            }),
          );
        }),
      { meta: { cases: ["G12", "O18"] } },
    );

    it.effect(
      "renews a name listed twice once",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const ens = ensforge(devnet, { account: devnet.accounts.alice });
          const name = fixtures.byId("v2.registered").name;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const before = yield* ethEntry(devnet, labelOf(name));
              const once = yield* call(() =>
                ens.registration.getRenewalPrice({ names: name, duration: year }),
              );
              const result = yield* call(() =>
                ens.registration.renewSync({ names: [name, name], duration: year }),
              );
              // On chain the durations would stack; ensforge drops the duplicate.
              assert.strictEqual(
                (yield* ethEntry(devnet, labelOf(name))).expiry,
                before.expiry + year,
              );
              assert.strictEqual(result.paid, once.total);
            }),
          );
        }),
      { meta: { cases: ["G10"] } },
    );

    it.effect("refuses names that cannot be renewed before the wallet is asked", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const ens = ensforge(devnet, { account: devnet.accounts.alice });
        for (const id of ["v2.expired", "v1.unwrapped"]) {
          yield* expectRejection(
            () => ens.registration.renew({ names: fixtures.byId(id).name, duration: year }),
            { _tag: "NameStateError", code: "NAME_NOT_RENEWABLE" },
          );
        }
      }),
    );
  });
});
