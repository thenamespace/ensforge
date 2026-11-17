import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";

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
  });
});
