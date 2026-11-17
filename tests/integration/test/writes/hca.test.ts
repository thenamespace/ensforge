import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { hca } from "@ensforge/hca";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { parseEther, type Address } from "viem";

import { atTimestamp, ensforge, isolated, onProfile, passWaits } from "../support/chain.ts";
import { ethEntry, mintUsdc, usdcOf } from "./support.ts";

// Writes routed through the owner's Hosted Contract Account with the owner executor: the owner's
// wallet sends `executeByOwner`, and the HCA is `msg.sender`.

const label = (name: string) => name.slice(0, -".eth".length);
const year = 31_536_000n;

describe("HCA", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "deploys the owner's HCA once and executes calls from it",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          // An account the fixtures gave no HCA.
          const { user, bob } = devnet.accounts;
          const ens = ensforge(devnet, { account: user });

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              const predicted = yield* HcaActions.hca.predictAddress(ens, {});
              assert.isFalse((yield* HcaActions.hca.get(ens, {})).deployed);

              yield* HcaActions.hca.deploySync(ens, {});
              const account = yield* HcaActions.hca.verify(ens, {});
              assert.include(account, { address: predicted, owner: user, deployed: true });
              assert.deepStrictEqual(account.problems, []);

              // Revoking the implementation for new deployments leaves deployed accounts certified.
              yield* HcaActions.hcaAdmin.setDeploymentApprovalSync(
                ensforge(devnet, { account: devnet.accounts.owner }),
                { implementation: account.initialImplementation, approved: false },
              );
              assert.deepStrictEqual((yield* HcaActions.hca.verify(ens, {})).problems, []);

              yield* Effect.promise(() =>
                devnet.client.setBalance({ address: predicted, value: parseEther("2") }),
              );
              const before = yield* Effect.promise(() =>
                devnet.client.getBalance({ address: bob }),
              );
              yield* HcaActions.hca.executeSync(ens, {
                calls: [{ to: bob, value: parseEther("1"), data: "0x" }],
              });
              const after = yield* Effect.promise(() => devnet.client.getBalance({ address: bob }));
              assert.strictEqual(after - before, parseEther("1"));
            }),
          );
        }),
      { meta: { cases: ["Z04"] } },
    );

    it.effect("migrates several names in one execution", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const { alice } = devnet.accounts;
        const ens = ensforge(devnet, { account: alice });
        const names = [fixtures.byId("v2.reserved").name, fixtures.byId("v1.wrapped").name];

        yield* isolated(
          devnet,
          Effect.gen(function* () {
            const result = yield* Actions.migration.migrateSync(ens, {
              names,
              resolver: "keep",
              via: hca(),
              onStep: passWaits(devnet),
            });
            // The HCA's deployment and the token approvals, then one execution for both names.
            assert.deepStrictEqual(
              result.plan.steps.map((step) => step.id),
              ["hca-setup", "migrate"],
            );
            for (const name of names) {
              assert.strictEqual((yield* ethEntry(devnet, label(name))).owner, alice, name);
              assert.isTrue((yield* Actions.name.get(ens, { name })).migrated, name);
            }
          }),
        );
      }),
    );

    it.effect(
      "registers a name for the owner, paid by the HCA, with the owner's primary name",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const { carol } = devnet.accounts;
          const ens = ensforge(devnet, { account: carol });
          const name = "hca-registered.eth";
          const options = { names: name, duration: year, via: hca() };

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              // The HCA sends `register`, so it pays; without funds it is refused before sending.
              const account = yield* HcaActions.hca.predictAddress(ens, {});
              yield* expectFailure(Actions.registration.register.prepare(ens, options), {
                _tag: "InsufficientFundsError",
                code: "INSUFFICIENT_TOKEN_BALANCE",
              });

              yield* mintUsdc(devnet, account, 1_000_000_000n);
              const before = yield* usdcOf(devnet, account);
              const result = yield* Actions.registration.registerSync(ens, {
                ...options,
                primaryName: true,
                onStep: passWaits(devnet),
              });

              assert.strictEqual((yield* ethEntry(devnet, label(name))).owner, carol);
              assert.strictEqual(before - (yield* usdcOf(devnet, account)), result.paid);
              // The reverse record is the owner's, so the owner sets it.
              assert.deepInclude(result.plan.steps.at(-1), { id: "primaryName", from: "signer" });
              assert.strictEqual(yield* Actions.primaryName.get(ens, { address: carol }), name);
            }),
          );
        }),
    );

    it.effect(
      "refuses a name token sent to the HCA",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const { name, facts } = fixtures.byId("v2.registered");
          const owner = facts["owner"] as Address;
          const ens = ensforge(devnet, { account: owner });

          yield* isolated(
            devnet,
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
          const { alice, bob } = devnet.accounts;
          const ens = ensforge(devnet, { account: alice });
          const resolver = devnet.contracts["v2.publicResolver"] as Address;

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* HcaActions.hca.deploySync(ens, {});
              const block = yield* Effect.promise(() => devnet.client.getBlock());
              const session = yield* HcaActions.hca.authorizeSession(ens, {
                sessionKey: bob,
                resolver,
                validUntil: Number(block.timestamp) + 3600,
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
              const registration = { names: "session-name.eth", duration: year, resolver };
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

              yield* atTimestamp(
                devnet,
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
  });
});
