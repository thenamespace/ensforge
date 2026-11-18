import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Duration, Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { zeroAddress } from "viem";

import { Clients } from "../support/clients.ts";
import { v1Owners } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";

describe("wrapper writes", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "wraps a .eth name only from its registrant, burning only owner fuses",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob, carol } = devnet.accounts;
          const plain = fixtures.byId("records.v1").name;

          // Bob manages the name in the registry; alice holds its registrar token.
          yield* expectFailure(
            Actions.wrapper.wrap(clients.make({ account: bob }), {
              name: fixtures.byId("v1.unwrapped.manager").name,
            }),
            { _tag: "UnauthorizedError", code: "NOT_OWNER" },
          );
          // An operator of alice's NameWrapper tokens has no say over her registrar token.
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.write({
                account: alice,
                address: devnet.contract("v1.nameWrapper"),
                abi: Abis.v1.nameWrapper,
                functionName: "setApprovalForAll",
                args: [carol, true],
              });
              yield* expectFailure(
                Actions.wrapper.wrap(clients.make({ account: carol }), { name: plain }),
                { _tag: "UnauthorizedError", code: "NOT_OWNER" },
              );
            }),
          );
          // The wrapping data carries 16 bits of owner fuses; the parent's fuses sit above them.
          yield* expectFailure(
            Actions.wrapper.wrap(clients.make({ account: alice }), {
              name: plain,
              fuses: ["cannotUnwrap", "parentCannotControl"],
            }),
            { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
          );
        }),
      { meta: { cases: ["W17", "W19", "W20"] } },
    );

    it.effect(
      "renews .eth names through the registrar, not as a wrapped child",
      () =>
        Effect.gen(function* () {
          const { name, facts } = (yield* Fixtures).byId("v1.wrapped");
          const { accounts } = yield* Devnet;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const expiry = BigInt(String(facts["expiry"])) + Duration.days(365);

          yield* expectFailure(Actions.subname.update(ens, { name, expiry }), {
            _tag: "InvalidInputError",
            code: "INVALID_NAME",
          });
          yield* expectFailure(Actions.wrapper.setChildFuses(ens, { name, expiry }), {
            _tag: "InvalidInputError",
            code: "INVALID_NAME",
          });
        }),
      { meta: { cases: ["W15"] } },
    );

    it.effect(
      "changes an expired child's fuses only by recreating it with a new expiry",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const { name } = fixtures.byId("v1.wrapped.sub.expired");
          const expiry = (yield* chain.now) + Duration.days(30);

          yield* expectFailure(
            Actions.wrapper.setChildFuses(ens, { name, fuses: ["parentCannotControl"] }),
            { _tag: "NameStateError", code: "NAME_EXPIRED" },
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.createSync(ens, {
                name,
                owner: accounts.bob,
                resolver: null,
                fuses: ["parentCannotControl"],
                expiry,
              });
              const wrapped = yield* Actions.wrapper.getFuses(ens, { name });
              assert.deepInclude(wrapped, { owner: accounts.bob, expiry });
              assert.isTrue(wrapped?.burned.parentCannotControl);
            }),
          );
        }),
      { meta: { cases: ["W01"] } },
    );

    it.effect(
      "recreates an expired child that had cannotTransfer burned, with only its new fuses",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const name = `frozen.${fixtures.byId("v1.wrapped.locked").name}`;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.createSync(ens, {
                name,
                owner: accounts.bob,
                resolver: null,
                fuses: ["parentCannotControl", "cannotUnwrap", "cannotTransfer"],
                expiry: (yield* chain.now) + Duration.days(1),
              });
              yield* chain.increaseTime(Number(Duration.days(2)));
              yield* chain.mine();
              assert.strictEqual((yield* Actions.name.get(ens, { name })).status, "expired");

              yield* Actions.subname.createSync(ens, {
                name,
                owner: accounts.carol,
                resolver: null,
                fuses: ["parentCannotControl", "cannotUnwrap"],
                expiry: (yield* chain.now) + Duration.days(30),
              });
              const wrapped = yield* Actions.wrapper.getFuses(ens, { name });
              assert.strictEqual(wrapped?.owner, accounts.carol);
              assert.deepInclude(wrapped?.burned, {
                parentCannotControl: true,
                cannotUnwrap: true,
                cannotTransfer: false,
              });
            }),
          );
        }),
      { meta: { cases: ["W21"] } },
    );

    it.effect(
      "lets an emancipated child lapse with its parent",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const { name } = fixtures.byId("v1.wrapped.sub.emancipated");
          const parentExpiry = BigInt(
            String(fixtures.byId("v1.wrapped.locked").facts["wrapperExpiry"]),
          );

          yield* chain.atTimestamp(
            parentExpiry + 1n,
            Effect.gen(function* () {
              assert.deepInclude(yield* Actions.name.get(ens, { name }), {
                status: "expired",
                owner: null,
              });
              assert.isNull(yield* Actions.wrapper.getFuses(ens, { name }));
              yield* expectFailure(
                Actions.subname.update(ens, { name, expiry: parentExpiry + Duration.days(365) }),
                { _tag: "NameStateError", code: "NAME_EXPIRED" },
              );
            }),
          );
        }),
      { meta: { cases: ["W06"] } },
    );

    it.effect(
      "lets a child's owner burn it, unless cannotUnwrap is burned",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const owner = (yield* Clients).make({ account: accounts.bob });
          const { name } = fixtures.byId("v1.wrapped.sub");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.removeSync(owner, { name });
              assert.deepInclude(yield* v1Owners(name), { registry: zeroAddress });
              assert.isNull(yield* Actions.wrapper.getFuses(owner, { name }));
            }),
          );
          yield* expectFailure(
            Actions.subname.remove(owner, { name: fixtures.byId("v1.wrapped.sub.locked").name }),
            { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
          );
        }),
      { meta: { cases: ["W22"] } },
    );

    it.effect(
      "refuses parent-controlled fuses under an unlocked parent, and new fuses on emancipated children",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const child = `kid.${fixtures.byId("v1.wrapped").name}`;
          const emancipated = fixtures.byId("v1.wrapped.sub.emancipated").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.createSync(ens, {
                name: child,
                owner: accounts.bob,
                resolver: null,
              });
              for (const fuse of ["parentCannotControl", "canExtendExpiry"] as const) {
                const error = yield* expectFailure(
                  Actions.wrapper.setChildFuses.prepare(ens, { name: child, fuses: [fuse] }),
                  { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
                );
                assert.include(error.hint, "wrapper.setFuses");
              }
            }),
          );

          // The parent of an emancipated child only extends it.
          yield* expectFailure(
            Actions.wrapper.setChildFuses.prepare(ens, {
              name: emancipated,
              fuses: ["canExtendExpiry"],
            }),
            { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
          );
          yield* expectFailure(
            Actions.subname.create.prepare(ens, {
              name: emancipated,
              owner: accounts.carol,
              resolver: null,
              upsert: true,
            }),
            { _tag: "UnauthorizedError", code: "FUSE_BURNED" },
          );
        }),
      { meta: { cases: ["W02", "W03", "A08"] } },
    );

    it.effect(
      "wraps a name for its holder when an operator sends it",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, carol, user } = devnet.accounts;
          const operator = clients.make({ account: user });

          // A `.eth` name: an operator of the registrant's registrar tokens.
          const plain = fixtures.byId("records.v1").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.write({
                account: alice,
                address: devnet.contract("v1.baseRegistrar"),
                abi: Abis.v1.baseRegistrar,
                functionName: "setApprovalForAll",
                args: [user, true],
              });
              yield* Actions.wrapper.wrapSync(operator, { name: plain });
              assert.strictEqual((yield* v1Owners(plain)).wrapped?.[0], alice);
            }),
          );

          // Another name: an operator of its manager, once the manager approved the NameWrapper.
          const child = `held.${Name.parse(fixtures.byId("v1.subname").name).parent}`;
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.createSync(clients.make({ account: alice }), {
                name: child,
                owner: carol,
                resolver: null,
              });
              yield* chain.write({
                account: carol,
                address: devnet.contract("v1.registry"),
                abi: Abis.v1.ensRegistry,
                functionName: "setApprovalForAll",
                args: [user, true],
              });
              const error = yield* expectFailure(
                Actions.wrapper.wrap.prepare(operator, { name: child }),
                { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
              );
              assert.include(error.hint, "setApprovalForAll");

              yield* chain.write({
                account: carol,
                address: devnet.contract("v1.registry"),
                abi: Abis.v1.ensRegistry,
                functionName: "setApprovalForAll",
                args: [devnet.contract("v1.nameWrapper"), true],
              });
              yield* Actions.wrapper.wrapSync(operator, { name: child });
              assert.strictEqual((yield* v1Owners(child)).wrapped?.[0], carol);
            }),
          );
        }),
      { meta: { cases: ["M:D4", "W20"] } },
    );

    it.effect(
      "updates an expired child its parent still controls, and recreates a lapsed emancipated one",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const ens = (yield* Clients).make({ account: accounts.alice });
          const expiry = (yield* chain.now) + Duration.days(30);

          // The NameWrapper keeps a parent-controlled child's owner past its expiry.
          const stale = fixtures.byId("v1.wrapped.sub.expired").name;
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.updateSync(ens, { name: stale, expiry });
              assert.deepInclude(yield* Actions.name.get(ens, { name: stale }), {
                status: "registered",
                owner: accounts.bob,
                expiry,
              });
            }),
          );

          // An emancipated child loses its owner when it expires: it can only be recreated.
          const lapsed = fixtures.byId("v1.wrapped.sub.expired-emancipated").name;
          assert.deepInclude(yield* Actions.name.get(ens, { name: lapsed }), {
            status: "expired",
            owner: null,
          });
          for (const change of [{ expiry }, { owner: accounts.carol }]) {
            const error = yield* expectFailure(
              Actions.subname.update.prepare(ens, { name: lapsed, ...change }),
              { _tag: "NameStateError", code: "NAME_EXPIRED" },
            );
            assert.include(error.hint, "subname.create");
          }
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.subname.createSync(ens, {
                name: lapsed,
                owner: accounts.carol,
                resolver: null,
                fuses: ["parentCannotControl"],
                expiry,
              });
              assert.deepInclude(yield* Actions.name.get(ens, { name: lapsed }), {
                status: "registered",
                owner: accounts.carol,
              });
            }),
          );
        }),
      { meta: { cases: ["W05", "W09", "M:A12"] } },
    );
  });
});
