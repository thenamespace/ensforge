import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";

import { ensforge, isolated, onProfile } from "../support/chain.ts";
import { ethEntry, v1Owners } from "./support.ts";

describe("transfers and managers", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "transfers each ENSv1 role it is asked to",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice, carol } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const unwrapped = fixtures.byId("records.v1").name;
          const wrapped = fixtures.byId("v1.wrapped").name;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              // `owner` (the default) moves the registrar token and the manager.
              yield* Actions.name.transferSync(ens, { name: unwrapped, to: carol });
              assert.deepInclude(yield* v1Owners(devnet, unwrapped), {
                registry: carol,
                registrant: carol,
              });
            }),
          );
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, {
                name: unwrapped,
                to: carol,
                role: "registrant",
              });
              assert.deepInclude(yield* v1Owners(devnet, unwrapped), {
                registry: alice,
                registrant: carol,
              });
            }),
          );
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, { name: wrapped, to: carol });
              assert.strictEqual((yield* v1Owners(devnet, wrapped)).wrapped?.[0], carol);
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
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { alice, carol } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          // Alice holds the token; bob manages the name.
          const name = fixtures.byId("v1.unwrapped.manager").name;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.name.setManagerSync(ens, { name, manager: carol });
              assert.strictEqual((yield* v1Owners(devnet, name)).registry, carol);
              yield* Actions.name.reclaimSync(ens, { name });
              assert.strictEqual((yield* v1Owners(devnet, name)).registry, alice);
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
          const devnet = yield* Devnet;
          const { alice, carol } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const label = (id: string) => fixtures.byId(id).name.slice(0, -".eth".length);

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, {
                name: fixtures.byId("v2.registered").name,
                to: carol,
              });
              assert.strictEqual((yield* ethEntry(devnet, label("v2.registered"))).owner, carol);
            }),
          );

          // Another account holds a role: a safe transfer would leave it in place (GHSA-hvjh).
          const delegated = fixtures.byId("v2.roles").name;
          yield* expectFailure(Actions.name.transfer(ens, { name: delegated, to: carol }), {
            _tag: "UnauthorizedError",
            code: "TRANSFER_DISALLOWED",
          });
          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ens, { name: delegated, to: carol, unsafe: true });
              assert.strictEqual((yield* ethEntry(devnet, label("v2.roles"))).owner, carol);
            }),
          );
        }),
      { meta: { cases: ["M:A14", "M:A24"] } },
    );

    it.effect(
      "lets an approved operator transfer an ENSv2 name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { operator, user } = devnet.accounts;
          const operated = fixtures.byId("v2.operator").name;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.name.transferSync(ensforge(devnet, { account: operator }), {
                name: operated,
                to: user,
              });
              assert.strictEqual(
                (yield* ethEntry(devnet, operated.slice(0, -".eth".length))).owner,
                user,
              );
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
          const devnet = yield* Devnet;
          const { alice, bob, carol } = devnet.accounts;
          const name = fixtures.byId("v2.registered").name;
          const sender = ensforge(devnet, { account: alice });

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const { resolver } = yield* Actions.resolver.createSync(sender, {
                name,
                records: { texts: { url: "https://alice.example" } },
              });
              yield* Actions.resolver.setSync(sender, { name, resolver });
              yield* Actions.name.transferSync(sender, { name, to: carol, records: "handover" });

              const recipient = ensforge(devnet, { account: carol });
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
            Actions.name.transfer(ensforge(devnet, { account: bob }), {
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
