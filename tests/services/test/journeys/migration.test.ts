import { assert, layer } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";

import { hca } from "@ensforge/hca";
import { Plan } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { bigname } from "@ensforge/sdk/indexer";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { ensforge, passWaits } from "@ensforge/test-integration/support/chain";
import { gatewayAnswer, ownerText, txtProof } from "@ensforge/test-integration/support/dnssec";
import { gateway } from "@ensforge/test-integration/support/gateway";
import type { Address } from "viem";

import { Services, type ServicesApi } from "../stack/stack.ts";

// Moving names from ENSv1 to ENSv2, end to end against the chain and bigname. Nothing is reverted;
// each journey migrates different fixture names.

const client = (
  devnet: DevnetInstance,
  services: ServicesApi,
  account: Address,
  storage?: Plan.Storage,
) =>
  ensforge(devnet, {
    account,
    indexer: bigname({ url: services.indexerUrl }),
    ...(storage === undefined ? {} : { storage }),
  });

layer(Services.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })(
  "journeys: migration",
  (it) => {
    it.effect("a migration stopped after its first step resumes where it left off", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const devnet = yield* Devnet;
        const fixtures = yield* Fixtures;
        const { alice } = devnet.accounts;
        const name = fixtures.byId("records.v1").name;
        const storage = Plan.memoryStorage();
        const profile = { name, texts: ["url", "unicode"], contentHash: true } as const;
        const before = yield* Actions.record.get(client(devnet, services, alice), profile);

        // The app stops (the fiber is interrupted) once the first step is confirmed.
        const confirmed = yield* Deferred.make<string>();
        const first = yield* Effect.forkChild(
          Actions.migration.migrateSync(client(devnet, services, alice, storage), {
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
        const ens = client(devnet, services, alice, storage);
        const unfinished = (yield* Actions.plan.list(ens, {})).find(
          (record) => record.status !== "completed",
        );
        if (unfinished === undefined) return assert.fail("no unfinished migration plan");
        const events: string[] = [];
        yield* Actions.plan.resumeSync(ens, {
          id: unfinished.plan.id,
          onStep: (event) => {
            events.push(`${event.step.id}:${event.status}`);
            passWaits(devnet)(event);
          },
        });
        assert.notInclude(events, `${stoppedAfter}:submitted`);

        const after = yield* Actions.record.get(ens, profile);
        assert.notStrictEqual(after.resolver, before.resolver);
        assert.deepStrictEqual({ ...after, resolver: null }, { ...before, resolver: null });
        yield* services.waitForIndexed();
        assert.include(yield* Actions.indexer.getName(ens, { name }), {
          authority: "ensV2",
          owner: alice,
        });
      }),
    );

    it.effect("an owner migrates two names in one HCA execution", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const devnet = yield* Devnet;
        const fixtures = yield* Fixtures;
        const { alice } = devnet.accounts;
        const ens = client(devnet, services, alice);
        const names = [fixtures.byId("v2.reserved").name, fixtures.byId("v1.wrapped").name];

        const result = yield* Actions.migration.migrateSync(ens, {
          names,
          resolver: "keep",
          via: hca(),
          onStep: passWaits(devnet),
        });
        assert.strictEqual(
          result.plan.steps.filter((step) => step.id === "migrate").length,
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
        const devnet = yield* Devnet;
        const { carol } = devnet.accounts;
        const ens = client(devnet, services, carol);
        const name = "ensforge-journey.com";
        const block = yield* Effect.promise(() => devnet.client.getBlock());
        const { url } = yield* gateway(() =>
          gatewayAnswer(txtProof(name, [ownerText(carol)], Number(block.timestamp) - 60)),
        );

        yield* Actions.dns.claimSync(ens, { name, gatewayUrls: [url] });

        assert.strictEqual((yield* Actions.name.get(ens, { name })).owner, carol);
        yield* services.waitForIndexed();
        // DNS names stay in the ENSv1 registry, under the DNSRegistrar.
        assert.include(yield* Actions.indexer.getName(ens, { name }), {
          authority: "ensV1",
          owner: carol,
        });
      }),
    );
  },
);
