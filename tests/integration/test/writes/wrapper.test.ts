import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Duration } from "@ensforge/sdk";
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
  });
});
