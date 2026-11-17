import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

import { call, ensforge, onProfile } from "../support/chain.ts";

describe("access reads", () => {
  onProfile("v1-live")("v1-live", (it) => {
    it.effect(
      "reads ENSv1 operators, resolver delegates and token approvals",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { accounts } = yield* Devnet;
          const ens = ensforge(yield* Devnet);
          const name = fixtures.byId("account.resolver-delegate").name;

          const [operator, notOperator] = yield* Effect.all([
            call(() =>
              ens.approval.getOperator({
                owner: accounts.alice,
                operator: accounts.operator,
                contract: "registry",
              }),
            ),
            call(() =>
              ens.approval.getOperator({
                owner: accounts.bob,
                operator: accounts.operator,
                contract: "registry",
              }),
            ),
          ]);
          assert.deepStrictEqual([operator, notOperator], [true, false]);

          const [delegate, notDelegate] = yield* Effect.all([
            call(() => ens.approval.getDelegate({ name, delegate: accounts.approved })),
            call(() => ens.approval.getDelegate({ name, delegate: accounts.carol })),
          ]);
          assert.deepStrictEqual([delegate, notDelegate], [true, false]);

          const approved = fixtures.byId("v1.wrapped.approved");
          assert.strictEqual(
            yield* call(() => ens.approval.getToken({ name: approved.name })),
            approved.facts["approved"],
          );
          assert.isNull(
            yield* call(() => ens.approval.getToken({ name: fixtures.byId("v1.wrapped").name })),
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
          const ens = ensforge(yield* Devnet);
          const plain = fixtures.byId("v1.unwrapped").name;
          const locked = fixtures.byId("v1.wrapped.locked.all").name;

          const [owner, stranger] = yield* Effect.all([
            call(() => ens.permission.get({ name: plain, account: accounts.alice })),
            call(() => ens.permission.get({ name: plain, account: accounts.user })),
          ]);
          assert.deepInclude(owner.can, { transfer: true, setRecords: true, renew: true });
          // Anyone may renew a name; nothing else.
          assert.deepInclude(stranger.can, { transfer: false, setRecords: false, renew: true });

          const fused = yield* call(() =>
            ens.permission.get({ name: locked, account: accounts.alice }),
          );
          assert.deepInclude(fused.can, { transfer: false, setResolver: false, setRecords: true });
          assert.includeMembers([...fused.fuses], ["cannotTransfer", "cannotSetResolver"]);

          const check = yield* call(() =>
            ens.permission.check({ name: locked, operation: "transfer", account: accounts.alice }),
          );
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
          const ens = ensforge(yield* Devnet);
          const delegated = fixtures.byId("v2.roles");

          const roles = yield* call(() =>
            ens.role.get({
              account: String(delegated.facts["delegate"]),
              target: "registry",
              name: delegated.name,
            }),
          );
          assert.deepStrictEqual(roles.names, ["setResolver"]);

          const operated = fixtures.byId("v2.operator").name;
          const check = yield* call(() =>
            ens.permission.check({
              name: operated,
              operation: "transfer",
              account: accounts.alice,
            }),
          );
          assert.deepInclude(check, { allowed: false });
          assert.deepInclude(check.missing[0], { type: "owner" });
        }),
      { meta: { cases: ["M:A24"] } },
    );
  });
});
