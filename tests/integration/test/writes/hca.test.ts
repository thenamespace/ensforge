import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { hca } from "@ensforge/hca";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { parseEther, type Address } from "viem";

import { Clients } from "../support/clients.ts";
import { ethEntry, mintUsdc, usdcOf } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

// Writes routed through the owner's Hosted Contract Account with the owner executor: the owner's
// wallet sends `executeByOwner`, and the HCA is `msg.sender`.

describe("HCA", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "deploys the owner's HCA once and executes calls from it",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          // An account the fixtures gave no HCA.
          const ens = clients.make({ account: accounts.user });

          yield* chain.isolated(
            Effect.gen(function* () {
              const predicted = yield* HcaActions.hca.predictAddress(ens, {});
              assert.isFalse((yield* HcaActions.hca.get(ens, {})).deployed);

              yield* HcaActions.hca.deploySync(ens, {});
              const account = yield* HcaActions.hca.verify(ens, {});
              assert.include(account, { address: predicted, owner: accounts.user, deployed: true });
              assert.deepStrictEqual(account.problems, []);

              // Revoking the implementation for new deployments leaves deployed accounts certified.
              yield* HcaActions.hcaAdmin.setDeploymentApprovalSync(
                clients.make({ account: accounts.owner }),
                { implementation: account.initialImplementation, approved: false },
              );
              assert.deepStrictEqual((yield* HcaActions.hca.verify(ens, {})).problems, []);

              yield* chain.setBalance(predicted, parseEther("2"));
              const before = yield* chain.balance(accounts.bob);
              yield* HcaActions.hca.executeSync(ens, {
                calls: [{ to: accounts.bob, value: parseEther("1"), data: "0x" }],
              });
              assert.strictEqual((yield* chain.balance(accounts.bob)) - before, parseEther("1"));
            }),
          );
        }),
      { meta: { cases: ["Z04"] } },
    );

    it.effect(
      "migrates several names in one execution",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const fixtures = yield* Fixtures;
          const ens = clients.make({ account: accounts.alice });
          const names = [fixtures.byId("v2.reserved").name, fixtures.byId("v1.wrapped").name];

          yield* chain.isolated(
            Effect.gen(function* () {
              const result = yield* Actions.migration.migrateSync(ens, {
                names,
                resolver: "keep",
                via: hca(),
                onStep: chain.passWaits,
              });

              // The HCA's deployment and the token approvals, then one execution for both names.
              assert.deepStrictEqual(
                result.plan.steps.map((step) => step.id),
                ["hca-setup", "migrate"],
              );
              for (const name of names) {
                assert.strictEqual((yield* ethEntry(name)).owner, accounts.alice, name);
                assert.isTrue((yield* Actions.name.get(ens, { name })).migrated, name);
              }
            }),
          );
        }),
      { meta: { cases: ["M:D9"] } },
    );

    it.effect(
      "registers a name for the owner, paid by the HCA, with the owner's primary name",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.carol });
          const name = "hca-registered.eth";
          const options = { names: name, duration: Duration.years(1), via: hca() };

          yield* chain.isolated(
            Effect.gen(function* () {
              // The HCA sends `register`, so it pays; without funds it is refused before sending.
              const account = yield* HcaActions.hca.predictAddress(ens, {});
              yield* expectFailure(Actions.registration.register.prepare(ens, options), {
                _tag: "InsufficientFundsError",
                code: "INSUFFICIENT_TOKEN_BALANCE",
              });

              yield* mintUsdc(account, 1_000_000_000n);
              const before = yield* usdcOf(account);
              const result = yield* Actions.registration.registerSync(ens, {
                ...options,
                primaryName: true,
                onStep: chain.passWaits,
              });

              assert.strictEqual((yield* ethEntry(name)).owner, accounts.carol);
              assert.strictEqual(before - (yield* usdcOf(account)), result.paid);
              // The reverse record is the owner's, so the owner sets it.
              assert.deepInclude(result.plan.steps.at(-1), { id: "primaryName", from: "signer" });
              assert.strictEqual(
                yield* Actions.primaryName.get(ens, { address: accounts.carol }),
                name,
              );
            }),
          );
        }),
      { meta: { cases: ["M:D9"] } },
    );

    it.effect(
      "refuses a name token sent to the HCA",
      () =>
        Effect.gen(function* () {
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { name, facts } = (yield* Fixtures).byId("v2.registered");
          const ens = clients.make({ account: facts["owner"] as Address });

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* HcaActions.hca.deploySync(ens, {});
              const account = yield* HcaActions.hca.predictAddress(ens, {});
              // Hosted Contract Accounts refuse name tokens.
              yield* expectFailure(Actions.name.transferSync(ens, { name, to: account }), {
                _tag: "UnauthorizedError",
                code: "TRANSFER_DISALLOWED",
              });
            }),
          );
        }),
      { meta: { cases: ["Z01"] } },
    );

    it.effect(
      "authorizes a session, checks its calls, and revokes it",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { bob } = devnet.accounts;
          const ens = clients.make({ account: devnet.accounts.alice });
          const resolver = devnet.contract("v2.publicResolver");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* HcaActions.hca.deploySync(ens, {});
              const session = yield* HcaActions.hca.authorizeSession(ens, {
                sessionKey: bob,
                resolver,
                validUntil: Number(yield* chain.now) + 3600,
              });
              assert.deepStrictEqual(yield* HcaActions.hca.getSession(ens, { session }), {
                valid: true,
                problem: null,
              });

              // Sending value elsewhere is outside every session.
              yield* expectFailure(
                HcaActions.hca.checkSessionCalls(ens, {
                  session,
                  calls: [{ to: bob, value: parseEther("1"), data: "0x" }],
                }),
                { _tag: "HcaError", code: "HCA_ACTION_NOT_ALLOWED" },
              );

              // A registration plan to the owner with the session's resolver is within the session;
              // with a subregistry it is not.
              const registration = {
                names: "session-name.eth",
                duration: Duration.years(1),
                resolver,
              };
              const plan = yield* Actions.registration.register.prepare(ens, registration);
              assert.isTrue(
                yield* HcaActions.hca.checkSessionCalls(ens, { session, calls: plan.calls }),
              );
              const withSubregistry = yield* Actions.registration.register.prepare(ens, {
                ...registration,
                subregistry: bob,
              });
              yield* expectFailure(
                HcaActions.hca.checkSessionCalls(ens, { session, calls: withSubregistry.calls }),
                { _tag: "HcaError", code: "HCA_ACTION_NOT_ALLOWED" },
              );

              yield* chain.atTimestamp(
                BigInt(session.terms.validUntil) + 1n,
                Effect.gen(function* () {
                  assert.deepStrictEqual(yield* HcaActions.hca.getSession(ens, { session }), {
                    valid: false,
                    problem: "expired",
                  });
                }),
              );

              yield* HcaActions.hca.revokeSessionsSync(ens, {});
              assert.deepStrictEqual(yield* HcaActions.hca.getSession(ens, { session }), {
                valid: false,
                problem: "revoked",
              });
            }),
          );
        }),
      { meta: { cases: ["Z02", "Z05"] } },
    );

    it.effect("fails typed when the owner rejects a session approval", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const wallets = yield* Wallets;
        const { alice, bob } = devnet.accounts;
        const ens = clients.make({ account: alice, wallet: wallets.make(alice, { reject: true }) });

        yield* expectFailure(
          HcaActions.hca.authorizeSession(ens, {
            sessionKey: bob,
            resolver: devnet.contract("v2.publicResolver"),
            validUntil: Number(yield* chain.now) + 3600,
          }),
          { _tag: "UserRejectedError", code: "USER_REJECTED" },
        );
      }),
    );

    // HCA writes confirm through the SDK's runner like every write; these stand for all of them.
    it.effect("fails typed when a sent HCA execution reverts on chain", () =>
      Effect.gen(function* () {
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const context = yield* Effect.context<never>();
        const ens = clients.make({ account: accounts.user });
        const target = "0x000000000000000000000000000000000000dEaD";
        // The target starts reverting (`PUSH1 0 PUSH1 0 REVERT`) once the execution is submitted.
        const breakTarget = chain
          .setCode(target, "0x60006000fd")
          .pipe(Effect.andThen(chain.mine()));

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* HcaActions.hca.deploySync(ens, {});
            yield* chain.setAutomine(false);
            yield* expectFailure(
              HcaActions.hca.executeSync(ens, {
                calls: [{ to: target, data: "0x" }],
                onStep: (event) => {
                  if (event.status === "submitted") Effect.runForkWith(context)(breakTarget);
                },
              }),
              { _tag: "TransactionError", code: "TRANSACTION_REVERTED" },
            ).pipe(Effect.ensuring(Effect.orDie(chain.setAutomine(true))));
          }),
        );
      }),
    );

    it.effect("fails typed when an HCA execution's receipt does not come in time", () =>
      Effect.gen(function* () {
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const ens = clients.make({ account: accounts.user });

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* HcaActions.hca.deploySync(ens, {});
            yield* chain.setAutomine(false);
            yield* expectFailure(
              HcaActions.hca.executeSync(ens, {
                calls: [{ to: accounts.bob, value: 0n }],
                timeout: 300,
              }),
              { _tag: "TransactionError", code: "RECEIPT_TIMEOUT" },
            ).pipe(Effect.ensuring(Effect.orDie(chain.setAutomine(true))));
          }),
        );
      }),
    );
  });
});
