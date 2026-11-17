import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("wrapper.getFuses", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("decodes the fuses burned on parents and children", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { reader } = yield* Clients;
        const fusesOf = (id: string) =>
          Actions.wrapper.getFuses(reader, { name: fixtures.byId(id).name });

        const locked = yield* fusesOf("v1.wrapped.locked.all");
        assert.deepStrictEqual(locked?.burned, {
          cannotUnwrap: true,
          cannotBurnFuses: true,
          cannotTransfer: true,
          cannotSetResolver: true,
          cannotSetTtl: true,
          cannotCreateSubdomain: true,
          cannotApprove: true,
          parentCannotControl: true,
          isDotEth: true,
          canExtendExpiry: false,
        });

        const extendable = yield* fusesOf("v1.wrapped.sub.can-extend");
        assert.deepInclude(extendable?.burned, {
          parentCannotControl: true,
          canExtendExpiry: true,
          isDotEth: false,
        });
        assert.strictEqual((yield* fusesOf("v1.wrapped.sub"))?.fuses, 0);
      }),
    );

    it.effect(
      "withholds what the wrapper withholds once a token expires",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { reader } = yield* Clients;
          const fusesOf = (id: string) =>
            Actions.wrapper.getFuses(reader, { name: fixtures.byId(id).name });

          assert.isNull(yield* fusesOf("v1.wrapped.sub.expired-emancipated"));
          assert.isNull(yield* fusesOf("v1.wrapped.expired"));
          assert.isNull(yield* fusesOf("v1.wrapped.desynced"));
          assert.isNull(yield* fusesOf("v1.unwrapped"));

          // A plain child keeps its owner past expiry; the wrapper zeroes only its fuses.
          assert.deepInclude(yield* fusesOf("v1.wrapped.sub.expired"), {
            owner: devnet.accounts.bob,
            fuses: 0,
          });
          // In the registrar's grace period the wrapper token is still live.
          assert.strictEqual((yield* fusesOf("v1.wrapped.grace"))?.owner, devnet.accounts.alice);
        }),
      { meta: { cases: ["W05", "W07", "W08", "W09", "O07"] } },
    );
  });
});
