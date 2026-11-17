import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";

import { Clients } from "../support/clients.ts";
import { ethEntry, v1Owners } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";

describe("transfers and managers", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "transfers each ENSv1 role it is asked to",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, carol } = accounts;
          const ens = clients.make({ account: alice });
          const unwrapped = fixtures.byId("records.v1").name;
          const wrapped = fixtures.byId("v1.wrapped").name;

          // `owner` (the default) moves the registrar token and the manager.
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, { name: unwrapped, to: carol });
              assert.deepInclude(yield* v1Owners(unwrapped), {
                registry: carol,
                registrant: carol,
              });
            }),
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, {
                name: unwrapped,
                to: carol,
                role: "registrant",
              });
              assert.deepInclude(yield* v1Owners(unwrapped), {
                registry: alice,
                registrant: carol,
              });
            }),
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, { name: wrapped, to: carol });
              assert.strictEqual((yield* v1Owners(wrapped)).wrapped?.[0], carol);
            }),
          );

          yield* expectFailure(
            Actions.name.transfer(ens, {
              name: fixtures.byId("v1.wrapped.locked.cannot-transfer").name,
              to: carol,
            }),
            { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
          );
        }),
      { meta: { cases: ["M:A2", "M:A7", "M:A8", "O03"] } },
    );

    it.effect(
      "sets and reclaims the ENSv1 manager",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          // Alice holds the token; bob manages the name.
          const { name } = (yield* Fixtures).byId("v1.unwrapped.manager");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.name.setManagerSync(ens, { name, manager: accounts.carol });
              assert.strictEqual((yield* v1Owners(name)).registry, accounts.carol);

              yield* Actions.name.reclaimSync(ens, { name });
              assert.strictEqual((yield* v1Owners(name)).registry, accounts.alice);
            }),
          );
        }),
      { meta: { cases: ["M:A3", "O03", "O04"] } },
    );

    it.effect(
      "transfers ENSv2 names, safely only when nobody else holds roles",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const registered = fixtures.byId("v2.registered").name;
          const delegated = fixtures.byId("v2.roles").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, { name: registered, to: accounts.carol });
              assert.strictEqual((yield* ethEntry(registered)).owner, accounts.carol);
            }),
          );

          // Another account holds a role: a safe transfer would leave it in place (GHSA-hvjh).
          yield* expectFailure(
            Actions.name.transfer(ens, { name: delegated, to: accounts.carol }),
            {
              _tag: "UnauthorizedError",
              code: "TRANSFER_DISALLOWED",
            },
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, {
                name: delegated,
                to: accounts.carol,
                unsafe: true,
              });
              assert.strictEqual((yield* ethEntry(delegated)).owner, accounts.carol);
            }),
          );
        }),
      { meta: { cases: ["M:A14", "M:A24"] } },
    );

    it.effect(
      "lets an approved operator transfer an ENSv2 name",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { name } = (yield* Fixtures).byId("v2.operator");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.name.transferSync(clients.make({ account: accounts.operator }), {
                name,
                to: accounts.user,
              });
              assert.strictEqual((yield* ethEntry(name)).owner, accounts.user);
            }),
          );
        }),
      { meta: { cases: ["M:D4"] } },
    );

    it.effect(
      "hands record access over with an ENSv2 name, unless the resolver serves other names",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob, carol } = accounts;
          const name = fixtures.byId("v2.registered").name;
          const sender = clients.make({ account: alice });

          yield* chain.isolated(
            Effect.gen(function* () {
              const { resolver } = yield* Actions.resolver.createSync(sender, {
                name,
                records: { texts: { url: "https://alice.example" } },
              });
              yield* Actions.resolver.setSync(sender, { name, resolver });
              yield* Actions.name.transferSync(sender, { name, to: carol, records: "handover" });

              const recipient = clients.make({ account: carol });
              yield* Actions.record.setSync(recipient, {
                name,
                texts: { url: "https://carol.example" },
              });
              assert.strictEqual(
                yield* Actions.record.getText(recipient, { name, key: "url" }),
                "https://carol.example",
              );
              const former = yield* Actions.permission.check(sender, {
                name,
                operation: { setRecord: "text", key: "url" },
                account: alice,
              });
              assert.isFalse(former.allowed);
            }),
          );

          // Bob's resolver holds the records of several names; handing it over would give them all.
          yield* expectFailure(
            Actions.name.transfer(clients.make({ account: bob }), {
              name: fixtures.byId("records.v2").name,
              to: carol,
              records: "handover",
              unsafe: true,
            }),
            { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
          );
        }),
      { meta: { cases: ["M:B5"] } },
    );
  });
});
