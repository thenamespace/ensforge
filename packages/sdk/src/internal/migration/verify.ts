import { Effect, Record as Rec, Array as Arr, String as Str } from "effect";

import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import { MigrationError } from "../../errors/classes/MigrationError.js";
import type { AnyError } from "../../errors/types.js";
import { sameAddress } from "../address.js";
import { loadName } from "../name/load.js";
import { readRecords } from "../records/read.js";
import type { Expectation } from "./plan.js";

const same = (actual: Address | null, expected: Address | null) =>
  expected === null || sameAddress(actual, expected);

/** The differences between a migrated name's ENSv2 state and what the plan expected. */
const differences = Effect.fnUntraced(function* (
  client: Client,
  expected: Expectation,
): Effect.fn.Return<readonly string[], AnyError> {
  const { kind, state } = yield* loadName(client, expected.name);
  const found: string[] = [];
  if (kind !== "v2-migrated") found.push(`${expected.name} is ${kind}, not migrated`);
  if (!same(state.owner, expected.owner)) found.push(`${expected.name} owner is ${state.owner}`);
  if (!same(state.resolver, expected.resolver))
    found.push(`${expected.name} resolver is ${state.resolver}`);
  if (!same(state.subregistry, expected.subregistry))
    found.push(`${expected.name} subregistry is ${state.subregistry}`);

  const copied = expected.records;
  if (copied === undefined) return found;
  const read = yield* readRecords(client, {
    name: expected.name,
    selection: {
      texts: Rec.keys(copied.texts ?? {}),
      // Copied coins are keyed by symbol or decimal coin type.
      addresses: Arr.map(Rec.keys(copied.addresses ?? {}), (coin) =>
        /^\d+$/.test(coin) ? BigInt(coin) : coin,
      ),
      ...(copied.contentHash === undefined ? {} : { contentHash: true }),
    },
  });
  for (const [key, value] of Rec.toEntries(copied.texts ?? {})) {
    if ((read.texts?.[key] ?? null) !== value) found.push(`${expected.name} text ${key} differs`);
  }
  for (const [coin, value] of Rec.toEntries(copied.addresses ?? {})) {
    const actual = read.addresses?.[coin] ?? null;
    if (Str.toLowerCase(actual ?? "") !== Str.toLowerCase(value ?? ""))
      found.push(`${expected.name} address ${coin} differs`);
  }
  if (copied.contentHash !== undefined && (read.contentHash?.uri ?? null) !== copied.contentHash)
    found.push(`${expected.name} contenthash differs`);
  return found;
});

/** Fails with `VERIFICATION_FAILED` when a migrated name differs from its plan. */
export const verifyMigration = Effect.fnUntraced(function* (
  client: Client,
  expectations: readonly Expectation[],
): Effect.fn.Return<void, AnyError> {
  const found = (yield* Effect.forEach(expectations, (expected) => differences(client, expected), {
    concurrency: "unbounded",
  })).flat();
  if (found.length === 0) return undefined;

  return yield* Effect.fail(new MigrationError({ code: "VERIFICATION_FAILED", details: found }));
});
