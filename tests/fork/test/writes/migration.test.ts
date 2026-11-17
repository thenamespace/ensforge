import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Chain } from "@ensforge/test-devnet";
import { Clients } from "@ensforge/test-integration/support/clients";
import { ethEntry, v1Owners } from "@ensforge/test-integration/support/contracts";

import { onFork } from "../support/fork.ts";

describe("fork migration", () => {
  onFork("mainnet")("mainnet", (it) => {
    it.effect("migrates a real ENSv1 name its owner never moved", () =>
      Effect.gen(function* () {
        const chain = yield* Chain;
        const clients = yield* Clients;
        const name = "vitalik.eth";
        const { registrant } = yield* v1Owners(name);
        if (registrant === undefined) return assert.fail(`${name} has no registrar token`);
        const ens = clients.make({ account: registrant });

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* chain.impersonate(registrant);
            yield* chain.setBalance(registrant, 10n ** 18n);
            const before = yield* Actions.record.getAddress(ens, { name });
            assert.strictEqual(
              (yield* Actions.migration.get(ens, { name, account: registrant })).route,
              "unwrapped",
            );

            yield* Actions.migration.migrateSync(ens, {
              names: name,
              resolver: "keep",
              onStep: chain.passWaits,
            });

            assert.strictEqual((yield* ethEntry(name)).owner, registrant);
            assert.deepInclude(yield* Actions.name.get(ens, { name }), {
              kind: "v2-migrated",
              migrated: true,
            });
            assert.strictEqual(yield* Actions.record.getAddress(ens, { name }), before);
          }),
        );
      }),
    );
  });
});
