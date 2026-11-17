import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet, profileNames } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { ensforge, onProfile } from "@ensforge/test-integration/support/chain";
import { isAddress, type Address } from "viem";

import { disagreeing, readName, readPrimary } from "./compare.ts";
import { documented } from "./documented.ts";

// ensforge against viem's ENS actions and ensjs over every fixture. Each difference is either an
// ensforge bug (fixed), or listed in `documented.ts` with why; the list only shrinks.
describe("ensforge, viem and ensjs", () => {
  for (const profile of profileNames) {
    onProfile(profile)(profile, (it) => {
      it.effect("read every fixture alike, apart from documented differences", () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const ens = ensforge(devnet);
          const found: string[] = [];

          for (const fixture of fixtures.all) {
            const readings = [...(yield* readName(ens, devnet.client, fixture.name))];
            const address = fixture.facts["address"];
            if (typeof address === "string" && isAddress(address)) {
              readings.push(yield* readPrimary(ens, devnet.client, address as Address));
            }
            for (const reading of readings) {
              for (const library of disagreeing(reading)) {
                found.push(`${profile} ${fixture.id} ${reading.field}: ${library}`);
              }
            }
          }

          const expected = Object.keys(documented).filter((key) => key.startsWith(`${profile} `));
          assert.sameMembers(found, expected);
        }),
      );
    });
  }
});
