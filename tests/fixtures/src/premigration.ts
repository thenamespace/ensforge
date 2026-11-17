import { Effect } from "effect";

import { step, type Step } from "@ensforge/test-devnet";
import { zeroAddress } from "viem";

import { labelId } from "./builders/names.ts";
import type { Facts, Fixture } from "./fixture.ts";
import { days } from "./fixtures/durations.ts";

const grace = days(90n);

// The BatchRegistrar's limit per call is gas, not a count; chunks keep each call small.
const chunkSize = 25;

/**
 * Mainnet's premigration: before the launch, ENSv2 reserves every ENSv1 `.eth` label that is
 * registered or in grace, until its ENSv1 expiry plus the migration bonus. Fixtures marked
 * `unreserved`, and labels ENSv2 already holds, are left out; premigrated fixtures record
 * `premigrated: true`.
 */
export const premigration = (selected: readonly Fixture[], facts: Map<string, Facts>): Step =>
  step("fixtures premigration", (c) =>
    Effect.gen(function* () {
      const now = c.time.now();
      const excluded = new Set(
        selected
          .filter((fixture) => fixture.unreserved === true)
          .map((fixture) => String(facts.get(fixture.id)?.["name"])),
      );
      const names = [
        ...new Set(selected.map((fixture) => String(facts.get(fixture.id)?.["name"]))),
      ].filter((name) => /^[^.]+\.eth$/u.test(name) && !excluded.has(name));

      const reservations: { readonly name: string; readonly expiry: bigint }[] = [];
      for (const name of names) {
        const label = name.slice(0, -".eth".length);
        const expiry = yield* c.read<bigint>("v1.baseRegistrar", "nameExpires", [labelId(label)]);
        if (expiry === 0n || expiry + grace <= now) continue;
        const status = yield* c.read<number>("v2.ethRegistry", "getStatus", [labelId(label)]);
        if (status !== 0) continue;
        reservations.push({ name, expiry: expiry + 1n + days(62n) });
      }

      const resolver = yield* c.address("v2.ensV1Resolver");
      for (let start = 0; start < reservations.length; start += chunkSize) {
        const chunk = reservations.slice(start, start + chunkSize);
        yield* c.write("v2.batchRegistrar", "batchRegister", [
          zeroAddress,
          resolver,
          chunk.map(({ name }) => name.slice(0, -".eth".length)),
          chunk.map(({ expiry }) => expiry),
        ]);
      }

      const reserved = new Set(reservations.map(({ name }) => name));
      for (const fixture of selected) {
        const found = facts.get(fixture.id);
        if (found !== undefined && reserved.has(String(found["name"]))) {
          facts.set(fixture.id, { ...found, premigrated: true });
        }
      }
    }),
  );
