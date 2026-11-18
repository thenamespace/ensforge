import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Clients } from "@ensforge/test-integration/support/clients";
import { ethEntry, usdcOf } from "@ensforge/test-integration/support/contracts";

import { fundToken, onFork } from "../support/fork.ts";

describe("fork registration", () => {
  for (const network of ["mainnet", "sepolia"] as const) {
    onFork(network)(network, (it) => {
      it.effect("registers a name with the real registrar, paying in USDC", () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { carol } = devnet.accounts;
          const ens = clients.make({ account: carol });
          const name = "ensforge-fork-registration.eth";
          const duration = Duration.years(1);

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* fundToken(devnet.contract("v2.usdc"), carol, 1_000_000_000n);
              const quote = yield* Actions.registration.getPrice(ens, { name, duration });

              const result = yield* Actions.registration.registerSync(ens, {
                names: name,
                duration,
                onStep: chain.passWaits,
              });

              assert.strictEqual((yield* ethEntry(name)).owner, carol);
              assert.strictEqual(result.paid, quote.total);
              assert.strictEqual(1_000_000_000n - (yield* usdcOf(carol)), result.paid);
            }),
          );
        }),
      );
    });
  }
});
