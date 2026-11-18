import { assert, layer } from "@effect/vitest";
import { Effect, Result } from "effect";

import { Name } from "@ensforge/sdk";
import { Actions, CoinType, ContentHash } from "@ensforge/sdk/effect";
import { Fixtures } from "@ensforge/test-fixtures";
import { Clients } from "@ensforge/test-integration/support/clients";
import type { Address, Hex } from "viem";

import { Services } from "../stack/stack.ts";
import { nameDifferences } from "./compare.ts";
import { indexedDifferences, indexedRecordDifferences } from "./differences.ts";

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
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;
          const ens = clients.make({ indexer: services.indexer });

          const found: string[] = [];
          for (const fixture of fixtures.all) {
            const differences = yield* nameDifferences(ens, fixture.id, fixture.name);
            found.push(...differences.map((difference) => difference.entry));
          }

          assert.deepStrictEqual(found.toSorted(), Object.keys(indexedDifferences).toSorted());
        }),
      { meta: { cases: ["I01", "I19", "T06"] } },
    );

    it.effect(
      "indexes every fixture's records as its resolver answers them",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;
          const ens = clients.make({ indexer: services.indexer });
          const found: string[] = [];
          let compared = 0;

          for (const fixture of fixtures.all) {
            const { name } = fixture;
            // Names bigname cannot answer for are compared by the name test above.
            const indexed = yield* Actions.indexer
              .getRecords(ens, { name })
              .pipe(Effect.orElseSucceed(() => null));
            if (indexed === null || indexed.inventory === null) continue;
            const texts = Object.keys(indexed.texts);
            const coins = Object.keys(indexed.addresses).map(BigInt);
            if (texts.length === 0 && coins.length === 0 && indexed.contentHash === null) continue;

            // `record.get` refuses content hashes of unknown codecs (K23); read those without it.
            const contentHash = yield* Effect.try(() =>
              indexed.contentHash === null ? null : ContentHash.decode(indexed.contentHash),
            ).pipe(Effect.orElseSucceed(() => undefined));
            const block = indexed.asOf?.blockNumber;
            const read = yield* Effect.result(
              Actions.record.get(ens, {
                name,
                texts,
                addresses: coins,
                ...(contentHash === undefined ? {} : { contentHash: true as const }),
                ...(block === undefined ? {} : { blockNumber: block }),
              }),
            );
            if (Result.isFailure(read)) {
              found.push(`${fixture.id}: chain error ${read.failure.code}`);
              continue;
            }

            const chain = read.success;
            compared += 1;
            for (const key of texts) {
              const value = chain.texts[key] ?? null;
              if (value !== indexed.texts[key]) found.push(`${fixture.id}: text ${key}`);
            }
            // bigname serves the record's bytes; `record.get` decodes them (a zero EVM address is null).
            for (const coin of coins) {
              const value = chain.addresses[`${coin}`] ?? null;
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

    it.effect(
      "does not follow CCIP-Read when it verifies records on-chain",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;
          const ens = clients.make({ indexer: services.indexer });

          const records = yield* Actions.indexer.getRecords(ens, {
            name: fixtures.byId("resolver.offchain").name,
            keys: ["addr:60"],
            source: "verified",
          });

          // bigname documents `offchain_lookup_required`; v0.14.11 reports the OffchainLookup as a
          // revert. Either way it answers no value and never calls the gateway.
          assert.deepStrictEqual(records?.answers["addr:60"], {
            status: "failed",
            value: null,
            reason: "resolver_call_reverted",
          });
          assert.strictEqual(records?.origin, "verified");
        }),
      { meta: { cases: ["I14"] } },
    );

    it.effect(
      "serves an alias path only on the name route",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;
          const ens = clients.make({ indexer: services.indexer });
          const linked = fixtures.byId("v2.linked");
          const alias = String(linked.facts["alias"]);

          // One registry under two names: the alias reads as the same registration, but only
          // the name route walks alias paths.
          const canonical = yield* Actions.indexer.getName(ens, { name: linked.name });
          const aliased = yield* Actions.indexer.getName(ens, { name: alias });
          assert.strictEqual(aliased?.name, alias);
          assert.strictEqual(aliased?.registrationId, canonical?.registrationId);

          const looked = yield* Actions.indexer.lookup(ens, { inputs: [linked.name, alias] });
          assert.deepStrictEqual(
            looked.results.map((result) => result.status),
            ["ok", "notFound"],
          );
        }),
      { meta: { cases: ["I09"] } },
    );

    it.effect(
      "leaves expired and released subnames out when asked",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;
          const ens = clients.make({ indexer: services.indexer });
          const wrapped = fixtures.byId("v1.wrapped.sub.expired").name;
          const emancipated = fixtures.byId("v1.wrapped.sub.expired-emancipated").name;
          const parent = Name.parse(wrapped).parent ?? assert.fail(`${wrapped} has no parent`);

          // By expiry, not status: bigname still calls the parent-controlled child active.
          const all = (yield* Actions.indexer.getSubnames(ens, {
            name: parent,
            includeExpired: true,
          })).items
            .map((item) => item.name)
            .toSorted();
          const live = (yield* Actions.indexer.getSubnames(ens, {
            name: parent,
            includeExpired: false,
          })).items
            .map((item) => item.name)
            .toSorted();
          assert.includeMembers(all, [wrapped, emancipated]);
          assert.deepStrictEqual(
            live,
            all.filter((name) => name !== wrapped && name !== emancipated),
          );

          // A child whose ENSv1 owner was cleared stays listed, as `unregistered`.
          const deleted = fixtures.byId("v1.subname.deleted").name;
          const cleared = yield* Actions.indexer.getSubnames(ens, {
            name: Name.parse(deleted).parent ?? assert.fail(`${deleted} has no parent`),
            includeExpired: false,
          });
          assert.deepStrictEqual(
            cleared.items.map((item) => [item.name, item.status]),
            [[deleted, "unregistered"]],
          );
        }),
      { meta: { cases: ["I18"] } },
    );

    it.effect(
      "withholds a lapsed wrapped name's owner and fuses, keeping its wrapper expiry",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;
          const ens = clients.make({ indexer: services.indexer });
          const lapsed = fixtures.byId("v1.wrapped.sub.expired-emancipated");

          const indexed = yield* Actions.indexer.getName(ens, { name: lapsed.name });
          assert.deepInclude(indexed, { owner: null, manager: null });
          assert.deepInclude(indexed?.ensV1, {
            wrapperState: "lapsed",
            wrapperFuses: null,
            wrapperExpiresAt: BigInt(String(lapsed.facts["expiry"])),
          });
        }),
      { meta: { cases: ["W10"] } },
    );

    it.effect(
      "serves an ENSv1 name without a live ENSv2 entry with its owner and expiry, unresolved",
      () =>
        Effect.gen(function* () {
          const services = yield* Services;
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;
          const ens = clients.make({ indexer: services.indexer });
          // Not premigrated: ENSv2 holds nothing for it, so resolution no longer reaches it.
          const plain = fixtures.byId("v1.unwrapped");

          const indexed = yield* Actions.indexer.getName(ens, { name: plain.name });
          assert.deepInclude(indexed, {
            authority: "ensV1",
            owner: plain.facts["owner"] as Address,
            resolver: null,
          });
          assert.strictEqual(indexed?.ensV1?.expiresAt, BigInt(String(plain.facts["expiry"])));
        }),
      { meta: { cases: ["O32"] } },
    );
  },
);
