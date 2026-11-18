import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";

import { Clients } from "../support/clients.ts";
import { ethEntry, v1Owners } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

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
              const v1Owners2 = yield* v1Owners(unwrapped);
              assert.deepInclude(v1Owners2, {
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
              const v1Owners2 = yield* v1Owners(unwrapped);
              assert.deepInclude(v1Owners2, {
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
      "transfers an ENSv2 name only while it holds canTransferAdmin and is live",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob, carol } = accounts;
          const ens = clients.make({ account: alice });
          const name = fixtures.byId("v2.registered").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.role.revokeSync(ens, {
                holder: alice,
                roles: ["canTransferAdmin"],
                target: "registry",
                name,
              });
              for (const unsafe of [false, true]) {
                yield* expectFailure(Actions.name.transfer(ens, { name, to: carol, unsafe }), {
                  _tag: "UnauthorizedError",
                  code: "TRANSFER_DISALLOWED",
                });
              }
            }),
          );
          yield* expectFailure(
            Actions.name.transfer(ens, { name: fixtures.byId("v2.expired").name, to: carol }),
            { _tag: "NameStateError", code: "NAME_EXPIRED" },
          );

          // A child of a registry its parent still controls moves only unsafely.
          const child = fixtures.byId("v2.subnames").name;
          const owner = clients.make({ account: bob });
          yield* expectFailure(Actions.name.transfer(owner, { name: child, to: carol }), {
            _tag: "NameStateError",
            code: "REGISTRY_NOT_EMANCIPATED",
          });
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.name.transferSync(owner, { name: child, to: carol, unsafe: true });
              assert.strictEqual((yield* Actions.name.get(owner, { name: child })).owner, carol);
            }),
          );
        }),
      { meta: { cases: ["W29", "W30", "W31"] } },
    );

    it.effect("refuses a transfer the name's expiry overtakes before it can be mined", () =>
      Effect.gen(function* () {
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const ens = (yield* Clients).make({ account: accounts.alice });
        const { name } = (yield* Fixtures).byId("v2.registered");
        const { expiry } = yield* ethEntry(name);

        // Live in the latest block, expired in the next one, where the write is simulated.
        yield* chain.atTimestamp(
          expiry - 1n,
          expectFailure(Actions.name.transfer(ens, { name, to: accounts.carol }), {
            _tag: "NameStateError",
            code: "NAME_EXPIRED",
          }),
        );
      }),
    );

    it.effect(
      "refuses a prepared transfer once its token ID regenerates, and transfers it afresh",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const wallets = yield* Wallets;
          const { name } = (yield* Fixtures).byId("v2.registered");
          const wallet = wallets.make(accounts.alice);
          const ens = clients.make({ account: accounts.alice, wallet });

          yield* chain.isolated(
            Effect.gen(function* () {
              const plan = yield* Actions.name.transfer.prepare(ens, { name, to: accounts.carol });
              // The seller changes a regeneration role first: the token gets a new ID.
              yield* Actions.role.grantSync(ens, {
                grantee: accounts.alice,
                roles: ["canTransfer"],
                target: "registry",
                name,
              });
              const sent = wallet.methods.length;

              // The transfer names the old token ID; the account still owns the name.
              const error = yield* expectFailure(Actions.plan.send(ens, { plan }), {
                _tag: "PlanError",
                code: "PLAN_STALE",
              });
              assert.strictEqual(error.context.revert?.errorName, "ERC1155InsufficientBalance");
              assert.notInclude(wallet.methods.slice(sent), "eth_sendTransaction");

              yield* Actions.name.transferSync(ens, { name, to: accounts.carol });
              assert.strictEqual((yield* ethEntry(name)).owner, accounts.carol);
            }),
          );
        }),
      { meta: { cases: ["W25"] } },
    );

    it.effect(
      "clears an ENSv1 token approval when the name moves or is unwrapped",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const { name } = (yield* Fixtures).byId("v1.wrapped.approved");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, { name, to: accounts.carol });
              const token = yield* Actions.approval.getToken(ens, { name });
              assert.isNull(token);
            }),
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.wrapper.unwrapSync(ens, { name });
              const token = yield* Actions.approval.getToken(ens, { name });
              assert.isNull(token);
            }),
          );
        }),
      { meta: { cases: ["W13"] } },
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
              const textAfterTransfer = yield* Actions.record.getText(recipient, {
                name,
                key: "url",
              });
              assert.strictEqual(textAfterTransfer, "https://carol.example");
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

    // Regression: the refusal was one shared error, so every later one named the first call's name.
    it.effect("names each refused handover's own name", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const ens = (yield* Clients).make({ account: accounts.alice });

        for (const id of ["records.v1", "v1.wrapped"]) {
          const { name } = fixtures.byId(id);
          const error = yield* expectFailure(
            Actions.name.transfer(ens, { name, to: accounts.carol, records: "handover" }),
            { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
          );
          assert.strictEqual(error.context.name, name);
        }
      }),
    );
  });
});
