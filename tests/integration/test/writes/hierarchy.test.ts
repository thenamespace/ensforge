import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { nameWrapperFuses as fuse } from "@ensforge/contracts/v1";
import { Duration, Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { parseEventLogs, zeroAddress, type Address } from "viem";

import { Clients } from "../support/clients.ts";
import { v1Owners } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";

describe("subnames, wrapper and registries", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "creates, updates and removes ENSv1 subnames",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, carol } = accounts;
          const ens = clients.make({ account: alice });
          const child = `new.${fixtures.byId("records.v1").name}`;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.createSync(ens, { name: child });
              assert.strictEqual((yield* v1Owners(child)).registry, alice);
              yield* Actions.subname.updateSync(ens, { name: child, owner: carol });
              assert.strictEqual((yield* v1Owners(child)).registry, carol);
              yield* Actions.subname.removeSync(ens, { name: child });
              assert.strictEqual((yield* v1Owners(child)).registry, zeroAddress);
            }),
          );
        }),
      { meta: { cases: ["M:A4", "O12"] } },
    );

    // Regression: only the parent's owner took the parent route; its operator was sent the
    // child's own `setRecord`, which the registry and the NameWrapper refused.
    it.effect(
      "removes a child as an operator of its parent",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, carol } = devnet.accounts;
          const operator = clients.make({ account: carol });

          const unwrapped = fixtures.byId("v1.subname").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.write({
                account: alice,
                address: devnet.contract("v1.registry"),
                abi: Abis.v1.ensRegistry,
                functionName: "setApprovalForAll",
                args: [carol, true],
              });
              yield* Actions.subname.removeSync(operator, { name: unwrapped });
              assert.strictEqual((yield* v1Owners(unwrapped)).registry, zeroAddress);
            }),
          );

          const wrapped = fixtures.byId("v1.wrapped.sub").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.write({
                account: alice,
                address: devnet.contract("v1.nameWrapper"),
                abi: Abis.v1.nameWrapper,
                functionName: "setApprovalForAll",
                args: [carol, true],
              });
              yield* Actions.subname.removeSync(operator, { name: wrapped });
              assert.strictEqual((yield* v1Owners(wrapped)).registry, zeroAddress);
            }),
          );
        }),
      { meta: { cases: ["M:D4", "M:D8", "M:A4", "M:A9"] } },
    );

    it.effect(
      "follows NameWrapper fuse rules for children",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, carol } = accounts;
          const ens = clients.make({ account: alice });

          // A parent-controlled child changes hands at its parent's word.
          const controlled = fixtures.byId("v1.wrapped.sub").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.updateSync(ens, { name: controlled, owner: carol });
              assert.strictEqual((yield* v1Owners(controlled)).wrapped?.[0], carol);
            }),
          );
          // An emancipated child cannot be taken back.
          yield* expectFailure(
            Actions.subname.remove(ens, { name: fixtures.byId("v1.wrapped.sub.emancipated").name }),
            {
              _tag: "UnauthorizedError",
              code: "FUSE_BURNED",
            },
          );
          // Emancipating a child needs a locked parent (W02), checked before anything is signed.
          yield* expectFailure(
            Actions.subname.create.prepare(ens, {
              name: `new.${fixtures.byId("v1.wrapped").name}`,
              fuses: ["parentCannotControl"],
            }),
            { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
          );
          // CANNOT_CREATE_SUBDOMAIN on the parent.
          yield* expectFailure(
            Actions.subname.create(ens, {
              name: `x.${fixtures.byId("v1.wrapped.locked.cannot-create-subdomain").name}`,
            }),
            { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
          );
          // A locked parent emancipates its new child.
          const locked = fixtures.byId("v1.wrapped.locked").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              const child = `free.${locked}`;
              yield* Actions.subname.createSync(ens, {
                name: child,
                owner: carol,
                fuses: ["parentCannotControl"],
              });
              assert.strictEqual(
                ((yield* v1Owners(child)).wrapped?.[1] ?? 0) & fuse.parentCannotControl,
                fuse.parentCannotControl,
              );
            }),
          );
        }),
      { meta: { cases: ["M:A9", "M:A10", "M:D8", "W02", "W05"] } },
    );

    it.effect(
      "wraps, burns fuses, and refuses what burned fuses forbid",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice } = accounts;
          const ens = clients.make({ account: alice });

          const plain = fixtures.byId("records.v1").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.wrapper.wrapSync(ens, { name: plain, fuses: ["cannotUnwrap"] });
              const { wrapped } = yield* v1Owners(plain);
              assert.strictEqual(wrapped?.[0], alice);
              assert.strictEqual(
                (wrapped?.[1] ?? 0) & (fuse.cannotUnwrap | fuse.parentCannotControl),
                fuse.cannotUnwrap | fuse.parentCannotControl,
              );
            }),
          );
          const wrappedName = fixtures.byId("v1.wrapped").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.wrapper.unwrapSync(ens, { name: wrappedName });
              assert.strictEqual((yield* v1Owners(wrappedName)).registry, alice);
            }),
          );
          const locked = fixtures.byId("v1.wrapped.locked").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.wrapper.setFusesSync(ens, { name: locked, fuses: ["cannotTransfer"] });
              assert.strictEqual(
                ((yield* v1Owners(locked)).wrapped?.[1] ?? 0) & fuse.cannotTransfer,
                fuse.cannotTransfer,
              );
            }),
          );
          yield* expectFailure(Actions.wrapper.unwrap(ens, { name: locked }), {
            _tag: "UnauthorizedError",
            code: "FUSE_BURNED",
          });
          yield* expectFailure(
            Actions.wrapper.setFuses(ens, {
              name: fixtures.byId("v1.wrapped.locked.cannot-burn-fuses").name,
              fuses: ["cannotTransfer"],
            }),
            { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
          );
        }),
      { meta: { cases: ["M:A7", "M:A8", "W04"] } },
    );

    it.effect(
      "extends an emancipated child's expiry, up to its parent's",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const child = fixtures.byId("v1.wrapped.sub.emancipated").name;
          const parent = Name.parse(child).parent ?? assert.fail("a subname has a parent");

          yield* chain.isolated(
            Effect.gen(function* () {
              // Renewing the parent through ETHRenewerV1 extends its wrapper expiry too.
              yield* Actions.registration.renewSync(ens, {
                names: parent,
                duration: Duration.years(1),
              });
              const before = (yield* v1Owners(child)).wrapped?.[2] ?? 0n;
              const limit = (yield* v1Owners(parent)).wrapped?.[2] ?? 0n;
              assert.isTrue(limit > before + Duration.days(1), "the parent outlives the child");

              yield* Actions.wrapper.setChildFusesSync(ens, {
                name: child,
                expiry: before + Duration.days(1),
              });
              assert.strictEqual((yield* v1Owners(child)).wrapped?.[2], before + Duration.days(1));

              yield* Actions.wrapper.setChildFusesSync(ens, {
                name: child,
                expiry: limit + Duration.days(1),
              });
              assert.strictEqual((yield* v1Owners(child)).wrapped?.[2], limit);
            }),
          );
        }),
      { meta: { cases: ["W03", "W14", "G12"] } },
    );

    it.effect(
      "creates ENSv2 subnames, deploying a registry where the parent has none",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, carol } = accounts;
          const ens = clients.make({ account: alice });
          const parent = fixtures.byId("v2.registered").name;

          // A one-letter label: subnames have no length minimum, unlike `.eth` registrations.
          const child = `k.${parent}`;
          yield* chain.isolated(
            Effect.gen(function* () {
              const { plan } = yield* Actions.subname.createSync(ens, {
                name: child,
                owner: carol,
              });
              assert.deepStrictEqual(
                plan.steps.map((step) => step.id),
                ["deploy", "create"],
              );
              const registry = (yield* Actions.registry.get(ens, { name: parent }))?.address;
              if (registry === undefined) return assert.fail("no registry");
              const owner = yield* chain.read({
                address: registry,
                abi: Abis.v2.permissionedRegistry,
                functionName: "findOwner",
                args: ["k"],
              });
              assert.strictEqual(owner, carol);

              yield* Actions.subname.removeSync(ens, { name: child });
              assert.strictEqual(
                (yield* Actions.name.get(ens, { name: child })).status,
                "available",
              );
            }),
          );
        }),
      { meta: { cases: ["M:A18", "M:D8", "G05"] } },
    );

    it.effect(
      "deploys a registry and attaches it under a name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const name = fixtures.byId("v2.registered").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              const { registry } = yield* Actions.registry.deploySync(ens, { attachTo: name });
              const attached = yield* Actions.registry.get(ens, { name });
              assert.deepInclude(attached, {
                address: registry as Address,
                kind: "user",
                canonicalName: name,
              });
            }),
          );
        }),
      { meta: { cases: ["M:A18"] } },
    );
  });

  onProfile("v1-live")("v1-live", (it) => {
    // Regression: the child was rewritten through the NameWrapper, which only the owner of a
    // wrapped parent may use, so the owner of an unwrapped parent could not touch it.
    it.effect(
      "rewrites a wrapped child of an unwrapped parent in the registry, unwrapping it",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob, carol } = accounts;
          const ens = clients.make({ account: alice });
          const { name } = fixtures.byId("v1.wrapped.sub.unwrapped-parent");

          yield* chain.isolated(
            Effect.gen(function* () {
              const { receipt } = yield* Actions.subname.updateSync(ens, { name, owner: carol });
              assert.deepInclude(yield* Actions.name.get(ens, { name }), {
                wrapped: false,
                owner: carol,
              });
              // The NameWrapper is not told: its token stays with bob, and no NameUnwrapped.
              assert.strictEqual((yield* v1Owners(name)).wrapped?.[0], bob);
              assert.isEmpty(
                parseEventLogs({
                  abi: Abis.v1.nameWrapper,
                  eventName: "NameUnwrapped",
                  logs: receipt.logs,
                }),
              );
            }),
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.removeSync(ens, { name });
              assert.strictEqual((yield* v1Owners(name)).registry, zeroAddress);
            }),
          );
        }),
      { meta: { cases: ["O09"] } },
    );
  });
});
