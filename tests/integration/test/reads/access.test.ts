import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

import { ensforge, onProfile } from "../support/chain.ts";

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
            Actions.approval.getOperator(ens, {
              owner: accounts.alice,
              operator: accounts.operator,
              contract: "registry",
            }),
            Actions.approval.getOperator(ens, {
              owner: accounts.bob,
              operator: accounts.operator,
              contract: "registry",
            }),
          ]);
          assert.deepStrictEqual([operator, notOperator], [true, false]);

          const [delegate, notDelegate] = yield* Effect.all([
            Actions.approval.getDelegate(ens, { name, delegate: accounts.approved }),
            Actions.approval.getDelegate(ens, { name, delegate: accounts.carol }),
          ]);
          assert.deepStrictEqual([delegate, notDelegate], [true, false]);

          const approved = fixtures.byId("v1.wrapped.approved");
          assert.strictEqual(
            yield* Actions.approval.getToken(ens, { name: approved.name }),
            approved.facts["approved"],
          );
          assert.isNull(
            yield* Actions.approval.getToken(ens, { name: fixtures.byId("v1.wrapped").name }),
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
            Actions.permission.get(ens, { name: plain, account: accounts.alice }),
            Actions.permission.get(ens, { name: plain, account: accounts.user }),
          ]);
          assert.deepInclude(owner.can, { transfer: true, setRecords: true, renew: true });
          // Anyone may renew a name; nothing else.
          assert.deepInclude(stranger.can, { transfer: false, setRecords: false, renew: true });

          const fused = yield* Actions.permission.get(ens, {
            name: locked,
            account: accounts.alice,
          });
          assert.deepInclude(fused.can, { transfer: false, setResolver: false, setRecords: true });
          assert.includeMembers([...fused.fuses], ["cannotTransfer", "cannotSetResolver"]);

          const check = yield* Actions.permission.check(ens, {
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
          const ens = ensforge(yield* Devnet);
          const delegated = fixtures.byId("v2.roles");

          const roles = yield* Actions.role.get(ens, {
            account: String(delegated.facts["delegate"]),
            target: "registry",
            name: delegated.name,
          });
          assert.deepStrictEqual(roles.names, ["setResolver"]);

          const operated = fixtures.byId("v2.operator").name;
          const check = yield* Actions.permission.check(ens, {
            name: operated,
            operation: "transfer",
            account: accounts.alice,
          });
          assert.deepInclude(check, { allowed: false });
          assert.deepInclude(check.missing[0], { type: "owner" });
        }),
      { meta: { cases: ["M:A24"] } },
    );
  });
});
