import { assert, describe } from "@effect/vitest";
import { Effect, Array as Arr } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { ownedResolverSalt, predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import { hca } from "@ensforge/hca";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { factAddress, Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { parseEther, zeroAddress, type Address } from "viem";

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
      "migrates several names in one execution, through MigrationHelper",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const { accounts } = devnet;
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

              // The HCA's deployment and the approvals to MigrationHelper, one execution for both
              // names, then the NameWrapper approval revoked again.
              assert.deepStrictEqual(
                Arr.map(result.plan.steps, (step) => step.id),
                ["hca-setup", "migrate", "hca-cleanup"],
              );
              for (const name of names) {
                assert.strictEqual((yield* ethEntry(name)).owner, accounts.alice, name);
                assert.isTrue((yield* Actions.name.get(ens, { name })).migrated, name);
              }
              // Regression: the HCA stayed a NameWrapper operator of every wrapped name alice holds.
              const hcaAddress = yield* HcaActions.hca.predictAddress(ens, {});
              const operators = yield* Effect.forEach(
                [hcaAddress, devnet.contract("v2.migrationHelper")],
                (operator) =>
                  chain.read({
                    address: devnet.contract("v1.nameWrapper"),
                    abi: Abis.v1.nameWrapper,
                    functionName: "isApprovedForAll",
                    args: [accounts.alice, operator],
                  }),
                { concurrency: 1 },
              );
              assert.deepStrictEqual(operators, [false, false]);
            }),
          );
        }),
      { meta: { cases: ["M:D9"] } },
    );

    it.effect(
      "registers a name for the owner, paid by the HCA from the owner's wallet, with the owner's primary name",
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
              // The HCA sends `register` and pays; the owner's wallet funds what it is short of.
              const account = yield* HcaActions.hca.predictAddress(ens, {});
              yield* mintUsdc(accounts.carol, 1_000_000_000n);
              const before = yield* usdcOf(accounts.carol);
              yield* expectFailure(
                Actions.registration.register.prepare(ens, {
                  ...options,
                  via: hca({ funding: "none" }),
                }),
                { _tag: "InsufficientFundsError", code: "INSUFFICIENT_TOKEN_BALANCE" },
              );

              const result = yield* Actions.registration.registerSync(ens, {
                ...options,
                primaryName: true,
                onStep: chain.passWaits,
              });

              assert.strictEqual((yield* ethEntry(name)).owner, accounts.carol);
              assert.include(
                Arr.map(result.plan.warnings, (warning) => warning.code),
                "HCA_FUNDING",
              );
              // The reveal is one HCA execution, the primary name included.
              assert.deepStrictEqual(
                Arr.map(result.plan.steps, (step) => step.id),
                ["hca-setup", "commit", "register"],
              );
              const moved = before - (yield* usdcOf(accounts.carol));
              assert.strictEqual(moved - (yield* usdcOf(account)), result.paid);
              const primaryNameAfterRegistration = yield* Actions.primaryName.get(ens, {
                address: accounts.carol,
              });
              assert.strictEqual(primaryNameAfterRegistration, name);
            }),
          );
        }),
      { meta: { cases: ["M:D9"] } },
    );

    it.effect(
      "deploys resolvers the HCA and the owner can both write",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const { accounts } = devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.carol });
          const hasAllRoles = (resolver: Address, account: Address) =>
            chain.read({
              address: resolver,
              abi: Abis.v2.permissionedResolver,
              functionName: "hasRootRoles",
              args: [Roles.enhancedAccessControl.allRoles, account],
            });

          yield* chain.isolated(
            Effect.gen(function* () {
              const account = yield* HcaActions.hca.predictAddress(ens, {});
              yield* mintUsdc(account, 1_000_000_000n);
              const register = (name: string, resolver?: "owned") =>
                Actions.registration.registerSync(ens, {
                  names: name,
                  duration: Duration.years(1),
                  ...(resolver === undefined ? {} : { resolver }),
                  via: hca(),
                  onStep: chain.passWaits,
                });
              yield* register("hca-own.eth");
              yield* register("hca-shared.eth", "owned");

              // The HCA deploys its own shared resolver, at the address the ENS app uses for it.
              const factory = devnet.contract("v2.verifiableFactory");
              const proxyLogic = yield* chain.read({
                address: factory,
                abi: Abis.v2.verifiableFactory,
                functionName: "proxyLogic",
              });
              const shared = yield* Actions.resolver.get(ens, { name: "hca-shared.eth" });
              assert.strictEqual(
                shared?.address,
                predictVerifiableProxyAddress({
                  factory,
                  proxyLogic,
                  deployer: account,
                  salt: ownedResolverSalt(account),
                }),
              );

              // Both resolvers give the HCA and the owner every role, so either writes records.
              for (const name of ["hca-own.eth", "hca-shared.eth"]) {
                const resolver =
                  (yield* Actions.resolver.get(ens, { name }))?.address ?? zeroAddress;
                const holders = yield* Effect.all(
                  [hasAllRoles(resolver, account), hasAllRoles(resolver, accounts.carol)],
                  { concurrency: 1 },
                );
                assert.deepStrictEqual(holders, [true, true], name);
                yield* Actions.record.setSync(ens, {
                  name,
                  texts: { url: `https://${name}` },
                  via: hca(),
                });
                const url = yield* Actions.record.getText(ens, { name, key: "url" });
                assert.strictEqual(url, `https://${name}`);
              }

              // The address of a resolver the HCA creates comes from the HCA, which deploys it.
              const { resolver } = yield* Actions.resolver.createSync(ens, { via: hca() });
              const created = yield* hasAllRoles(resolver, account);
              assert.isTrue(created);
            }),
          );
        }),
      { meta: { cases: ["M:D9", "G29"] } },
    );

    it.effect(
      "sets the owner's default name through its HCA, not the HCA's",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const fixtures = yield* Fixtures;
          const ens = clients.make({ account: accounts.alice });
          const name = fixtures.byId("records.v1").name;

          yield* chain.isolated(
            Effect.gen(function* () {
              const result = yield* Actions.primaryName.setSync(ens, {
                name,
                coin: "default",
                via: hca(),
              });

              // One HCA execution through the adapter, with no signer step.
              assert.isFalse(Arr.some(result.plan.steps, (step) => step.from === "signer"));
              const account = yield* HcaActions.hca.predictAddress(ens, {});
              const [owner, ofHca] = yield* Effect.all(
                [
                  // The name has only an Ethereum address, so the default name verifies on
                  // Ethereum alone; read what is stored.
                  Actions.primaryName.get(ens, {
                    address: accounts.alice,
                    coin: "default",
                    verify: false,
                  }),
                  Actions.primaryName.get(ens, {
                    address: account,
                    coin: "default",
                    verify: false,
                  }),
                ],
                { concurrency: 1 },
              );
              assert.deepStrictEqual([owner, ofHca], [name, null]);
            }),
          );
        }),
      { meta: { cases: ["M:D9", "P02"] } },
    );

    it.effect(
      "refuses a name token sent to the HCA",
      () =>
        Effect.gen(function* () {
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { name, facts } = (yield* Fixtures).byId("v2.registered");
          const ens = clients.make({ account: factAddress(facts, "owner") });

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
              const now = yield* chain.now;
              const session = yield* HcaActions.hca.authorizeSession(ens, {
                sessionKey: bob,
                resolver,
                validUntil: Number(now) + 3600,
              });
              const activeSession = yield* HcaActions.hca.getSession(ens, { session });
              assert.deepStrictEqual(activeSession, {
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
              const registerCallsCheck = yield* HcaActions.hca.checkSessionCalls(ens, {
                session,
                calls: plan.calls,
              });
              assert.isTrue(registerCallsCheck);
              const withSubregistry = yield* Actions.registration.register.prepare(ens, {
                ...registration,
                subregistry: devnet.contract("v2.ethRegistry"),
              });
              yield* expectFailure(
                HcaActions.hca.checkSessionCalls(ens, { session, calls: withSubregistry.calls }),
                { _tag: "HcaError", code: "HCA_ACTION_NOT_ALLOWED" },
              );

              yield* chain.atTimestamp(
                BigInt(session.terms.validUntil) + 1n,
                Effect.gen(function* () {
                  const storedSession = yield* HcaActions.hca.getSession(ens, { session });
                  assert.deepStrictEqual(storedSession, {
                    valid: false,
                    problem: "expired",
                  });
                }),
              );

              yield* HcaActions.hca.revokeSessionsSync(ens, {});
              const revokedSession = yield* HcaActions.hca.getSession(ens, { session });
              assert.deepStrictEqual(revokedSession, {
                valid: false,
                problem: "revoked",
              });
            }),
          );
        }),
      { meta: { cases: ["Z02", "Z05"] } },
    );

    it.effect(
      "revokes a session signed before its HCA was deployed",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          // An account the fixtures gave no HCA.
          const ens = clients.make({ account: devnet.accounts.user });

          yield* chain.isolated(
            Effect.gen(function* () {
              const now = yield* chain.now;
              const session = yield* HcaActions.hca.authorizeSession(ens, {
                sessionKey: devnet.accounts.bob,
                resolver: devnet.contract("v2.publicResolver"),
                validUntil: Number(now) + 3600,
              });
              assert.isFalse((yield* HcaActions.hca.get(ens, {})).deployed);

              // Anyone could deploy the HCA and use the session, so revoking deploys it first.
              const result = yield* HcaActions.hca.revokeSessionsSync(ens, {});
              assert.deepStrictEqual(
                Arr.map(result.plan.warnings, (warning) => warning.code),
                ["HCA_DEPLOYED"],
              );
              assert.isTrue((yield* HcaActions.hca.get(ens, {})).deployed);
              const revoked = yield* HcaActions.hca.getSession(ens, { session });
              assert.deepStrictEqual(revoked, { valid: false, problem: "revoked" });
            }),
          );
        }),
      { meta: { cases: ["Z05"] } },
    );

    it.effect("fails typed when the owner rejects a session approval", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const wallets = yield* Wallets;
        const { alice, bob } = devnet.accounts;
        const ens = clients.make({ account: alice, wallet: wallets.make(alice, { reject: true }) });

        const now = yield* chain.now;
        yield* expectFailure(
          HcaActions.hca.authorizeSession(ens, {
            sessionKey: bob,
            resolver: devnet.contract("v2.publicResolver"),
            validUntil: Number(now) + 3600,
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
        const context = yield* Effect.context();
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
