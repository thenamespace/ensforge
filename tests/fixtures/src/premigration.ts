import { Effect } from "effect";

import { step, type Step } from "@ensforge/test-devnet";
import { zeroAddress } from "viem";

import { labelId } from "./builders/names.ts";
import type { Facts, Fixture } from "./fixture.ts";
import { days } from "./fixtures/durations.ts";

// The BatchRegistrar's limit per call is gas, not a count; chunks keep each call small.
const chunkSize = 25;

/** The `.eth` second-level name `name` is or sits under. */
const secondLevel = (name: string) => /[^.]+\.eth$/u.exec(name)?.[0];

/**
 * Mainnet's premigration: before the launch, ENSv2 reserves every ENSv1 `.eth` label that is
 * registered or in grace, until its ENSv1 expiry plus the migration bonus: the fixtures'
 * second-level names and those their subnames sit under. Fixtures marked `unreserved`, and labels
 * ENSv2 already holds, are left out; premigrated fixtures record `premigrated: true`, fixtures
 * below one `belowPremigrated: true`.
 */
export const premigration = (selected: readonly Fixture[], facts: Map<string, Facts>): Step =>
  step("fixtures premigration", (c) =>
    Effect.gen(function* () {
      const now = c.time.now();
      const excluded = new Set(
        selected
          .filter((fixture) => fixture.unreserved === true)
          .flatMap((fixture) => secondLevel(String(facts.get(fixture.id)?.["name"])) ?? []),
      );
      const names = [
        ...new Set(
          selected.flatMap((fixture) => secondLevel(String(facts.get(fixture.id)?.["name"])) ?? []),
        ),
      ].filter((name) => !excluded.has(name));

      const reservations: {
        readonly name: string;
        readonly label: string;
        readonly expiry: bigint;
      }[] = [];
      for (const name of names) {
        const label = name.slice(0, -".eth".length);
        const expiry = yield* c.read<bigint>("v1.baseRegistrar", "nameExpires", [labelId(label)]);
        // Registered or in the 90-day grace period.
        if (expiry === 0n || expiry + days(90n) <= now) continue;
        const status = yield* c.read<number>("v2.ethRegistry", "getStatus", [labelId(label)]);
        if (status !== 0) continue;
        reservations.push({ name, label, expiry: expiry + 1n + days(62n) });
      }

      const resolver = yield* c.address("v2.ensV1Resolver");
      for (let start = 0; start < reservations.length; start += chunkSize) {
        const chunk = reservations.slice(start, start + chunkSize);
        yield* c.write("v2.batchRegistrar", "batchRegister", [
          zeroAddress,
          resolver,
          chunk.map(({ label }) => label),
          chunk.map(({ expiry }) => expiry),
        ]);
      }

      const reserved = new Set(reservations.map(({ name }) => name));
      for (const fixture of selected) {
        const found = facts.get(fixture.id);
        if (found === undefined) continue;
        const name = String(found["name"]);
        const ancestor = secondLevel(name);
        if (reserved.has(name)) facts.set(fixture.id, { ...found, premigrated: true });
        else if (ancestor !== undefined && reserved.has(ancestor)) {
          facts.set(fixture.id, { ...found, belowPremigrated: true });
        }
      }
    }),
  );
