import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

import { ensforge, onProfile } from "../support/chain.ts";

/** Fixtures whose address has a verified primary name: the name each one reads. */
const verified = {
  "primary.addr-reverse": "rev-alice.eth",
  "primary.default-reverse": "rev-bob.eth",
  // `addr.reverse` takes priority over `default.reverse`.
  "primary.both": "rev-carol.eth",
  "primary.contract": "rev-contract.eth",
  "primary.reverse-2017": "rev-2017.eth",
  "primary.reverse-2020": "rev-2020.eth",
} as const;

describe("primaryName.get", () => {
  // ENSv1 names verify through ENSv1 before the launch and through the ENSv1 bridge after it.
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
      it.effect(
        "reads verified primary names from every reverse namespace and registrar generation",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const ens = ensforge(yield* Devnet);

            for (const [id, name] of Object.entries(verified)) {
              const address = String(fixtures.byId(id).facts["address"]);
              assert.strictEqual(yield* Actions.primaryName.get(ens, { address }), name, id);
              assert.isNull(yield* Actions.primaryName.get(ens, { address, coin: "base" }), id);
            }
          }),
        { meta: { cases: ["M:C3", "P01", "P05", "P22", "M:D10"] } },
      );

      it.effect(
        "returns null for names that do not verify, unless verification is off",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const ens = ensforge(yield* Devnet);
            const read = (id: string, verify?: boolean) => {
              const address = String(fixtures.byId(id).facts["address"]);
              return Actions.primaryName.get(
                ens,
                verify === undefined ? { address } : { address, verify },
              );
            };

            // The forward address belongs to someone else.
            assert.isNull(yield* read("primary.mismatch"));
            assert.strictEqual(yield* read("primary.mismatch", false), "v1-plain.eth");
            // Registered with a reverse record but no forward address.
            assert.isNull(yield* read("primary.at-registration"));
            assert.strictEqual(yield* read("primary.at-registration", false), "rev-registered.eth");
            // `Rev-Approved.eth` is never normalized into a primary name.
            assert.isNull(yield* read("primary.not-normalized"));
            assert.isNull(yield* read("primary.not-normalized", false));
          }),
        { meta: { cases: ["P07", "P08", "P26"] } },
      );
    });
  }
});
