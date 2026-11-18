import { assert, layer } from "@effect/vitest";
import { Deferred, Effect, Fiber, Option, Array as Arr } from "effect";

import { hca } from "@ensforge/hca";
import { Plan } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { Clients } from "@ensforge/test-integration/support/clients";
import { txtProof } from "@ensforge/test-integration/support/dnssec";
import { Gateways } from "@ensforge/test-integration/support/gateways";

import { Services } from "../stack/stack.ts";

// Moving names from ENSv1 to ENSv2, end to end against the chain and bigname. Nothing is reverted;
// each journey migrates different fixture names.

layer(Services.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })(
  "journeys: migration",
  (it) => {
    it.effect("a migration stopped after its first step resumes where it left off", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const fixtures = yield* Fixtures;
        const { alice } = accounts;
        const storage = Plan.memoryStorage();
        const ens = clients.make({ account: alice, storage, indexer: services.indexer });
        const name = fixtures.byId("records.v1").name;
        const profile = { name, texts: ["url", "unicode"], contentHash: true } as const;
        const before = yield* Actions.record.get(ens, profile);

        // The app stops (the fiber is interrupted) once the first step is confirmed.
        const confirmed = yield* Deferred.make<string>();
        const first = yield* Effect.forkChild(
          Actions.migration.migrateSync(ens, {
            names: name,
            resolver: "new",
            onStep: (event) => {
              if (event.status === "confirmed") {
                Deferred.doneUnsafe(confirmed, Effect.succeed(event.step.id));
              }
            },
          }),
        );
        const stoppedAfter = yield* Deferred.await(confirmed);
        yield* Fiber.interrupt(first);

        // A new session finds the unfinished plan and finishes it without repeating the step.
        const session = clients.make({ account: alice, storage, indexer: services.indexer });
        const records = yield* Actions.plan.list(session, {});
        const unfinished = Option.getOrUndefined(
          Arr.findFirst(records, (record) => record.status !== "completed"),
        );
        if (unfinished === undefined) assert.fail("no unfinished migration plan");
        const events: string[] = [];
        yield* Actions.plan.resumeSync(session, {
          id: unfinished.plan.id,
          onStep: (event) => {
            events.push(`${event.step.id}:${event.status}`);
            chain.passWaits(event);
          },
        });
        assert.notInclude(events, `${stoppedAfter}:submitted`);

        const after = yield* Actions.record.get(session, profile);
        assert.notStrictEqual(after.resolver, before.resolver);
        assert.deepStrictEqual({ ...after, resolver: null }, { ...before, resolver: null });
        yield* services.waitForIndexed();
        const indexedName = yield* Actions.indexer.getName(session, { name });
        assert.include(indexedName, {
          authority: "ensV2",
          owner: alice,
        });
      }),
    );

    it.effect("an owner migrates two names in one HCA execution", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const fixtures = yield* Fixtures;
        const { alice } = accounts;
        const ens = clients.make({ account: alice, indexer: services.indexer });
        const names = [fixtures.byId("v2.reserved").name, fixtures.byId("v1.wrapped").name];

        const result = yield* Actions.migration.migrateSync(ens, {
          names,
          resolver: "keep",
          via: hca(),
          onStep: chain.passWaits,
        });
        assert.strictEqual(
          Arr.filter(result.plan.steps, (step) => step.id === "migrate").length,
          1,
          "one execution",
        );

        yield* services.waitForIndexed();
        for (const name of names) {
          const indexed = yield* Actions.indexer.getName(ens, { name });
          assert.include(indexed, { authority: "ensV2", owner: alice }, name);
          assert.isNotNull(indexed?.migratedAt, name);
        }
      }),
    );

    it.effect("a DNS name is imported with its DNSSEC proof", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const gateways = yield* Gateways;
        const { carol } = accounts;
        const ens = clients.make({ account: carol, indexer: services.indexer });
        const name = "ensforge-journey.com";
        const now = yield* chain.now;
        const signedAt = Number(now) - 60;
        const { url } = yield* gateways.serveProof(txtProof(name, [`a=${carol}`], signedAt));

        yield* Actions.dns.claimSync(ens, { name, gatewayUrls: [url] });

        assert.strictEqual((yield* Actions.name.get(ens, { name })).owner, carol);
        yield* services.waitForIndexed();
        // DNS names stay in the ENSv1 registry, under the DNSRegistrar.
        const indexedName = yield* Actions.indexer.getName(ens, { name });
        assert.include(indexedName, {
          authority: "ensV1",
          owner: carol,
        });
      }).pipe(Effect.scoped),
    );
  },
);
