import { assert, layer } from "@effect/vitest";
import { Effect, Array as Arr } from "effect";

import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { expectFailure } from "@ensforge/test-harness";
import { Clients } from "@ensforge/test-integration/support/clients";

import { Services } from "../stack/stack.ts";

// What people do with a name, end to end: each journey writes through ensforge, then checks the
// chain and what bigname indexed. Nothing is reverted; every journey uses its own names.

layer(Services.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })(
  "journeys: names",
  (it) => {
    it.effect("a new user registers a profile and is found by address", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const { carol } = accounts;
        const ens = clients.make({ account: carol, indexer: services.indexer });
        const name = "journey-new.eth";

        yield* Actions.registration.registerSync(ens, {
          names: name,
          duration: Duration.years(1),
          records: {
            texts: { url: "https://carol.example", description: "Carol" },
            addresses: { eth: carol },
          },
          primaryName: true,
          onStep: chain.passWaits,
        });

        // Resolution on-chain.
        const primaryNameOnChain = yield* Actions.primaryName.get(ens, { address: carol });
        assert.strictEqual(primaryNameOnChain, name);
        assert.deepStrictEqual(
          (yield* Actions.record.get(ens, { name, texts: ["url"], addresses: ["eth"] })).texts,
          { url: "https://carol.example" },
        );

        // And what an app's address lookup shows.
        yield* services.waitForIndexed();
        const [found] = (yield* Actions.indexer.lookup(ens, { inputs: [carol], profile: "detail" }))
          .results;
        assert.strictEqual(found?.name?.name, name);
        assert.strictEqual(found?.name?.records?.texts["description"], "Carol");
      }),
    );

    it.effect("an owner lets a profile manager edit chosen records, then takes it back", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const { carol, bob } = accounts;
        const owner = clients.make({ account: carol, indexer: services.indexer });
        const manager = clients.make({ account: bob, indexer: services.indexer });
        const name = "journey-managed.eth";

        yield* Actions.registration.registerSync(owner, {
          names: name,
          duration: Duration.years(1),
          onStep: chain.passWaits,
        });
        yield* Actions.permission.setRecordAccessSync(owner, {
          name,
          grantee: bob,
          records: { texts: ["url", "avatar"] },
        });

        yield* Actions.record.setSync(manager, { name, texts: { url: "https://managed.example" } });
        assert.isFalse(
          (yield* Actions.permission.check(manager, {
            name,
            operation: { setRecord: "text", key: "description" },
            account: bob,
          })).allowed,
        );
        yield* services.waitForIndexed();
        assert.strictEqual(
          (yield* Actions.indexer.getRecords(owner, { name }))?.texts["url"],
          "https://managed.example",
        );

        yield* Actions.permission.setRecordAccessSync(owner, {
          name,
          grantee: bob,
          records: { texts: ["url", "avatar"] },
          revoke: true,
        });
        yield* expectFailure(
          Actions.record.set(manager, { name, texts: { url: "https://revoked.example" } }),
          { _tag: "UnauthorizedError", code: "MISSING_ROLES" },
        );
      }),
    );

    it.effect("a team shares a name's subnames through registry roles", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const { carol, bob } = accounts;
        const owner = clients.make({ account: carol, indexer: services.indexer });
        const teammate = clients.make({ account: bob, indexer: services.indexer });
        const parent = "journey-team.eth";

        yield* Actions.registration.registerSync(owner, {
          names: parent,
          duration: Duration.years(1),
          onStep: chain.passWaits,
        });
        yield* Actions.subname.createSync(owner, { name: `docs.${parent}` });
        const registry = yield* Actions.registry.get(owner, { name: parent });
        if (registry === null) assert.fail(`${parent} has no subname registry`);

        // Before the grant the teammate is refused; with the registrar role it registers children.
        yield* expectFailure(Actions.subname.create(teammate, { name: `api.${parent}` }), {
          _tag: "UnauthorizedError",
        });
        yield* Actions.role.grantSync(owner, {
          grantee: bob,
          roles: ["registrar"],
          target: "registry",
          contract: registry.address,
          root: true,
        });
        yield* Actions.subname.createSync(teammate, { name: `api.${parent}`, owner: bob });

        yield* services.waitForIndexed();
        const page = yield* Actions.indexer.getSubnames(owner, { name: parent });
        assert.sameDeepMembers(
          Arr.map(page.items, (item) => [item.name, item.owner]),
          [
            [`docs.${parent}`, carol],
            [`api.${parent}`, bob],
          ],
        );
      }),
    );

    it.effect("a name is renewed and handed on, and its history tells the story", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const { carol, bob } = accounts;
        const ens = clients.make({ account: carol, indexer: services.indexer });
        const name = "journey-lifecycle.eth";

        const registered = yield* Actions.registration.registerSync(ens, {
          names: name,
          duration: Duration.years(1),
          onStep: chain.passWaits,
        });
        yield* Actions.registration.renewSync(ens, { names: name, duration: Duration.years(1) });
        yield* Actions.name.transferSync(ens, { name, to: bob });

        const state = yield* Actions.name.get(ens, { name });
        assert.strictEqual(state.owner, bob);
        assert.strictEqual(state.expiry, (registered.names[0]?.expiry ?? 0n) + Duration.years(1));

        yield* services.waitForIndexed();
        const history = yield* Actions.indexer.getHistory(ens, { name, order: "asc" });
        const types = Arr.map(history.items, (event) => event.type);
        assert.includeMembers(types, ["registration", "renewal", "transfer"]);
        assert.isBelow(types.indexOf("registration"), types.indexOf("renewal"));
        assert.isBelow(types.indexOf("renewal"), types.lastIndexOf("transfer"));
        assert.strictEqual((yield* Actions.indexer.getName(ens, { name }))?.owner, bob);
      }),
    );
  },
);
