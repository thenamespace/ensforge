import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";

import { CoinType, ContentHash, Errors } from "@ensforge/sdk";
import { bigname, indexerActions } from "@ensforge/sdk/indexer";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { ensforge } from "@ensforge/test-integration/support/chain";
import { isAddressEqual, type Address, type Hex } from "viem";

import { Services } from "../stack/stack.ts";
import { indexedDifferences, indexedRecordDifferences } from "./differences.ts";

const same = (a: Address | null | undefined, b: Address | null | undefined) =>
  a === null || a === undefined || b === null || b === undefined
    ? (a ?? null) === (b ?? null)
    : isAddressEqual(a, b);

/**
 * The indexer statuses that describe a chain status: bigname calls a registration that ended
 * `released` (also once it was unregistered), and keeps `expired` for the window before that.
 */
const statusesFor: Readonly<Record<string, readonly string[]>> = {
  registered: ["active"],
  grace: ["active", "expired"],
  expired: ["expired", "released"],
  available: ["released", "unregistered"],
  reserved: ["active"],
};

// Every fixture, read from the chain and from bigname at the block bigname has indexed. Where they
// differ by design, `differences.ts` says why; the list only shrinks.
layer(Services.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })(
  "bigname against the chain",
  (it) => {
    it.effect(
      "indexes every fixture name as the chain holds it",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const devnet = yield* Devnet;
          const fixtures = yield* Fixtures;
          const ens = ensforge(devnet, { indexer: bigname({ url: services.indexerUrl }) }).extend(
            indexerActions(),
          );
          const found: string[] = [];

          for (const fixture of fixtures.all) {
            const { name } = fixture;
            const indexed = yield* Effect.promise(() =>
              ens.indexer.getName({ name }).catch((error: unknown) => ({ error })),
            );
            if (indexed !== null && "error" in indexed) {
              found.push(
                `${fixture.id}: indexer error ${String((indexed.error as Error).message).split("\n")[0]}`,
              );
              continue;
            }
            const block = indexed?.asOf?.blockNumber;
            const state = yield* Effect.promise(() =>
              ens.name
                .get({ name, ...(block === undefined ? {} : { blockNumber: block }) })
                .catch((error: unknown) => ({ error })),
            );
            if ("error" in state) {
              const code = Errors.is(state.error) ? state.error.code : String(state.error);
              found.push(`${fixture.id}: chain error ${code}`);
              continue;
            }
            if (indexed === null) {
              if (state.status !== "available") found.push(`${fixture.id}: not indexed`);
              continue;
            }
            if (!(statusesFor[state.status] ?? []).includes(indexed.status ?? "")) {
              found.push(`${fixture.id}: status ${indexed.status}, chain ${state.status}`);
            }
            if (!same(indexed.owner, state.owner)) {
              found.push(`${fixture.id}: owner ${indexed.owner}, chain ${state.owner}`);
            }
            // While ENSv1 decides a name, its registry resolver and registrar expiry are ENSv1
            // facts; the top-level fields describe what ENSv2 serves (the reservation).
            const v1 = indexed.authority === "ensV1" || indexed.authority === "ensV0";
            const resolver = v1 ? indexed.ensV1?.resolver?.address : indexed.resolver?.address;
            if (!same(resolver, state.resolver)) {
              found.push(`${fixture.id}: resolver ${resolver}, chain ${state.resolver}`);
            }
            // Subnames have no registrar lease; their NameWrapper expiry is the top-level one.
            const expiry = (v1 ? indexed.ensV1?.expiresAt : undefined) ?? indexed.expiresAt;
            if (state.expiry !== null && expiry !== state.expiry) {
              found.push(`${fixture.id}: expiry ${expiry}, chain ${state.expiry}`);
            }
          }

          assert.deepStrictEqual(found.toSorted(), Object.keys(indexedDifferences).toSorted());
        }),
      { meta: { cases: ["I01", "I19"] } },
    );

    it.effect(
      "indexes every fixture's records as its resolver answers them",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const devnet = yield* Devnet;
          const fixtures = yield* Fixtures;
          const ens = ensforge(devnet, { indexer: bigname({ url: services.indexerUrl }) }).extend(
            indexerActions(),
          );
          const found: string[] = [];
          let compared = 0;

          for (const fixture of fixtures.all) {
            const { name } = fixture;
            const indexed = yield* Effect.promise(() =>
              ens.indexer.getRecords({ name }).catch(() => null),
            );
            if (indexed === null || indexed.inventory === null) continue;
            const texts = Object.keys(indexed.texts);
            const coins = Object.keys(indexed.addresses).map(BigInt);
            if (texts.length === 0 && coins.length === 0 && indexed.contentHash === null) continue;

            // `record.get` refuses content hashes of unknown codecs (K23); read those without it.
            const contentHash = yield* Effect.try(() =>
              indexed.contentHash === null ? null : ContentHash.decode(indexed.contentHash),
            ).pipe(Effect.orElseSucceed(() => undefined));
            const block = indexed.asOf?.blockNumber;
            const chain = yield* Effect.promise(() =>
              ens.record
                .get({
                  name,
                  texts,
                  addresses: coins,
                  ...(contentHash === undefined ? {} : { contentHash: true as const }),
                  ...(block === undefined ? {} : { blockNumber: block }),
                })
                .catch(() => null),
            );
            if (chain === null) {
              found.push(`${fixture.id}: chain error`);
              continue;
            }
            compared += 1;
            for (const key of texts) {
              const value = (chain.texts as Record<string, string | null>)[key] ?? null;
              if (value !== indexed.texts[key]) found.push(`${fixture.id}: text ${key}`);
            }
            // bigname serves the record's bytes; `record.get` decodes them (a zero EVM address is null).
            for (const coin of coins) {
              const value =
                (chain.addresses as Record<string, string | null>)[String(coin)] ?? null;
              const bytes = indexed.addresses[String(coin)] as Hex;
              if (value?.toLowerCase() !== CoinType.decodeAddress(coin, bytes)?.toLowerCase()) {
                found.push(`${fixture.id}: addr ${coin}`);
              }
            }
            if (
              contentHash !== undefined &&
              contentHash?.uri !==
                (chain as { contentHash?: { uri: string } | null }).contentHash?.uri
            ) {
              found.push(`${fixture.id}: contenthash`);
            }
          }

          // Fixtures with records exist on every profile; an empty comparison would prove nothing.
          assert.isAbove(compared, 5);
          assert.deepStrictEqual(
            found.toSorted(),
            Object.keys(indexedRecordDifferences).toSorted(),
          );
        }),
      { meta: { cases: ["I19"] } },
    );
  },
);
