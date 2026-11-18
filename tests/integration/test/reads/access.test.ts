import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { namehash, zeroAddress } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("access reads", () => {
  onProfile("v1-live")("v1-live", (it) => {
    it.effect(
      "reads ENSv1 operators, resolver delegates and token approvals",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;
          const name = fixtures.byId("account.resolver-delegate").name;
          const approved = fixtures.byId("v1.wrapped.approved");

          const operators = yield* Effect.all([
            Actions.approval.getOperator(reader, {
              owner: accounts.alice,
              operator: accounts.operator,
              contract: "registry",
            }),
            Actions.approval.getOperator(reader, {
              owner: accounts.bob,
              operator: accounts.operator,
              contract: "registry",
            }),
          ]);
          assert.deepStrictEqual(operators, [true, false]);

          const delegates = yield* Effect.all([
            Actions.approval.getDelegate(reader, { name, delegate: accounts.approved }),
            Actions.approval.getDelegate(reader, { name, delegate: accounts.carol }),
          ]);
          assert.deepStrictEqual(delegates, [true, false]);

          assert.strictEqual(
            yield* Actions.approval.getToken(reader, { name: approved.name }),
            approved.facts["approved"],
          );
          assert.isNull(
            yield* Actions.approval.getToken(reader, { name: fixtures.byId("v1.wrapped").name }),
          );
        }),
      { meta: { cases: ["M:D4", "M:D6", "A01", "A02", "W12"] } },
    );

    it.effect(
      "reports what an account may do, and why not",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;
          const plain = fixtures.byId("v1.unwrapped").name;
          const locked = fixtures.byId("v1.wrapped.locked.all").name;

          const [owner, stranger] = yield* Effect.all([
            Actions.permission.get(reader, { name: plain, account: accounts.alice }),
            Actions.permission.get(reader, { name: plain, account: accounts.user }),
          ]);
          assert.deepInclude(owner.can, { transfer: true, setRecords: true, renew: true });
          // Anyone may renew a name; nothing else.
          assert.deepInclude(stranger.can, { transfer: false, setRecords: false, renew: true });

          const fused = yield* Actions.permission.get(reader, {
            name: locked,
            account: accounts.alice,
          });
          assert.deepInclude(fused.can, { transfer: false, setResolver: false, setRecords: true });
          assert.includeMembers([...fused.fuses], ["cannotTransfer", "cannotSetResolver"]);

          const check = yield* Actions.permission.check(reader, {
            name: locked,
            operation: "transfer",
            account: accounts.alice,
          });
          assert.deepInclude(check, { allowed: false });
          assert.deepInclude(check.missing[0], { type: "blocked", reason: "fuse" });
        }),
      { meta: { cases: ["M:A8"] } },
    );
  });

  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "reads ENSv2 roles held by accounts other than the owner",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;
          const delegated = fixtures.byId("v2.roles");

          const roles = yield* Actions.role.get(reader, {
            account: String(delegated.facts["delegate"]),
            target: "registry",
            name: delegated.name,
          });
          assert.deepStrictEqual(roles.names, ["setResolver"]);

          const check = yield* Actions.permission.check(reader, {
            name: fixtures.byId("v2.operator").name,
            operation: "transfer",
            account: accounts.alice,
          });
          assert.deepInclude(check, { allowed: false });
          assert.deepInclude(check.missing[0], { type: "owner" });
        }),
      { meta: { cases: ["M:A24"] } },
    );

    it.effect(
      "refuses safe transfers of names in a registry that is not emancipated",
      () =>
        Effect.gen(function* () {
          const { name, facts } = (yield* Fixtures).byId("v2.subnames");
          const { reader } = yield* Clients;

          const check = yield* Actions.permission.check(reader, {
            name,
            operation: "transfer",
            account: String(facts["owner"]),
          });
          assert.deepInclude(check, { allowed: false });
          assert.deepInclude(check.missing[0], {
            type: "blocked",
            reason: "transfer-disallowed",
            detail:
              "The registry is not emancipated; `name.transfer` with `unsafe: true` sends it anyway.",
          });
        }),
      { meta: { cases: ["W29"] } },
    );

    it.effect(
      "renews wrapped subnames through the parent's authority, or the child's with canExtendExpiry",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { reader } = yield* Clients;
          const { alice, bob, carol } = devnet.accounts;
          const nameWrapper = devnet.contract("v1.nameWrapper");
          const renew = (id: string, account: string) =>
            Actions.permission.check(reader, {
              name: fixtures.byId(id).name,
              operation: "renew",
              account,
            });

          assert.deepInclude(yield* renew("v1.wrapped.sub", alice), {
            allowed: true,
            via: "owner",
          });
          // Expired, but the NameWrapper keeps its owner: the parent can still extend it.
          assert.deepInclude(yield* renew("v1.wrapped.sub.expired", alice), {
            allowed: true,
            via: "owner",
          });
          assert.deepInclude(yield* renew("v1.wrapped.sub.expired-emancipated", alice), {
            allowed: false,
          });
          assert.deepInclude(yield* renew("v1.wrapped.sub", bob), { allowed: false });
          assert.deepInclude(yield* renew("v1.wrapped.sub.can-extend", bob), {
            allowed: true,
            via: "owner",
          });

          // A token approval of the parent extends its children; one of the child does not.
          const parentNode = BigInt(namehash(fixtures.byId("v1.wrapped.locked").name));
          const childNode = BigInt(namehash(fixtures.byId("v1.wrapped.sub.can-extend").name));
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.write({
                account: alice,
                address: nameWrapper,
                abi: Abis.v1.nameWrapper,
                functionName: "approve",
                args: [carol, parentNode],
              });
              yield* chain.write({
                account: bob,
                address: nameWrapper,
                abi: Abis.v1.nameWrapper,
                functionName: "approve",
                args: [carol, childNode],
              });
              assert.deepInclude(yield* renew("v1.wrapped.sub", carol), {
                allowed: true,
                via: "approved",
              });
              yield* chain.write({
                account: alice,
                address: nameWrapper,
                abi: Abis.v1.nameWrapper,
                functionName: "approve",
                args: [zeroAddress, parentNode],
              });
              assert.deepInclude(yield* renew("v1.wrapped.sub.can-extend", carol), {
                allowed: false,
              });
            }),
          );
        }),
      { meta: { cases: ["W09", "W12", "W14", "M:D8"] } },
    );

    it.effect(
      "gives a NameWrapper token approval no say over the name itself",
      () =>
        Effect.gen(function* () {
          const approved = (yield* Fixtures).byId("v1.wrapped.approved");
          const { reader } = yield* Clients;

          const checks = yield* Effect.forEach(["transfer", "setResolver"] as const, (operation) =>
            Actions.permission.check(reader, {
              name: approved.name,
              operation,
              account: String(approved.facts["approved"]),
            }),
          );
          for (const check of checks) {
            assert.deepInclude(check, { allowed: false });
            assert.deepInclude(check.missing[0], { type: "owner" });
          }
        }),
      { meta: { cases: ["W12", "M:D5"] } },
    );

    it.effect(
      "reads no roles on an expired ENSv2 name",
      () =>
        Effect.gen(function* () {
          const { name } = (yield* Fixtures).byId("v2.expired");
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;

          // The registry still stores alice's roles; it reports none once the name expires.
          assert.deepInclude(
            yield* Actions.role.get(reader, { account: accounts.alice, target: "registry", name }),
            { roles: 0n, names: [], admin: [] },
          );
        }),
      { meta: { cases: ["W35"] } },
    );
  });
});
