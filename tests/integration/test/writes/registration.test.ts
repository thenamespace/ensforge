import { assert, describe } from "@effect/vitest";
import { Effect, Array as Arr, Option, Record as Rec, String as Str, pipe } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { ownedResolverSalt, predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { encodeFunctionData, erc20Abi, pad, parseAbi, toHex, zeroAddress } from "viem";

import { Clients } from "../support/clients.ts";
import { ethEntry, mintUsdc, usdcOf } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";
import { Wallets } from "../support/wallets.ts";

describe("registration", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "registers a name through commit, wait and reveal, paying the quote",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          // Carol has not approved the registrar: the plan approves first.
          const ens = clients.make({ account: accounts.carol });
          const duration = Duration.years(1);

          yield* chain.isolated(
            Effect.gen(function* () {
              const quote = yield* Actions.registration.getPrice(ens, {
                name: "qqqqq.eth",
                duration,
              });
              const before = yield* usdcOf(accounts.carol);

              const result = yield* Actions.registration.registerSync(ens, {
                names: "qqqqq.eth",
                duration,
                onStep: chain.passWaits,
              });

              const entry = yield* ethEntry("qqqqq.eth");
              assert.strictEqual(entry.owner, accounts.carol);
              assert.strictEqual(entry.expiry, result.names[0]?.expiry);
              assert.strictEqual(result.paid, quote.total);
              assert.strictEqual(before - (yield* usdcOf(accounts.carol)), result.paid);
            }),
          );
        }),
      { meta: { cases: ["G17", "M:A14"] } },
    );

    // Committing the raw label would register a name nobody can type.
    it.effect(
      "registers the normalized name for input that normalization changes",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });

          yield* chain.isolated(
            Effect.gen(function* () {
              const result = yield* Actions.registration.registerSync(ens, {
                names: "ＱＱＱＱＱ.eth",
                duration: Duration.years(1),
                onStep: chain.passWaits,
              });

              assert.strictEqual(result.names[0]?.name, "qqqqq.eth");
              assert.strictEqual((yield* ethEntry("qqqqq.eth")).owner, accounts.alice);
            }),
          );
        }),
      { meta: { cases: ["L33"] } },
    );

    it.effect(
      "registers from an earlier commitment only inside its window",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const options = { names: "qqqqq.eth", duration: Duration.years(1) } as const;

          yield* chain.isolated(
            Effect.gen(function* () {
              const { secret, readyAt } = yield* Actions.registration.commitSync(ens, options);
              yield* expectFailure(Actions.registration.registerSync(ens, { ...options, secret }), {
                _tag: "CommitmentError",
                code: "COMMITMENT_TOO_NEW",
              });

              const parameters = yield* Actions.registration.getParameters(ens);
              const expiresAt = readyAt - parameters.minCommitmentAge + parameters.maxCommitmentAge;
              yield* chain.atTimestamp(
                expiresAt,
                expectFailure(Actions.registration.registerSync(ens, { ...options, secret }), {
                  _tag: "CommitmentError",
                  code: "COMMITMENT_TOO_OLD",
                }),
              );

              yield* chain.atTimestamp(
                readyAt,
                Effect.gen(function* () {
                  const result = yield* Actions.registration.registerSync(ens, {
                    ...options,
                    secret,
                  });

                  // Only the reveal is left to send.
                  assert.deepStrictEqual(
                    Arr.map(result.plan.steps, (step) => step.id),
                    ["register"],
                  );
                  assert.strictEqual((yield* ethEntry("qqqqq.eth")).owner, accounts.alice);
                }),
              );
            }),
          );
        }),
      { meta: { cases: ["G06", "G20", "G21"] } },
    );

    it.effect(
      "sets records, a primary name and a referrer while registering",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const referrer = pad(toHex("ensforge"), { dir: "right" });

          const plan = yield* Actions.registration.register.prepare(ens, {
            names: "qqqqq.eth",
            duration: Duration.years(1),
            referrer,
          });
          assert.isTrue(
            Arr.some(plan.steps, (step) =>
              Arr.some(step.calls, (call) =>
                pipe(call.data, Str.includes(pipe(referrer, Str.slice(2)))),
              ),
            ),
            "referrer in the calldata",
          );

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.registration.registerSync(ens, {
                names: "qqqqq.eth",
                duration: Duration.years(1),
                records: {
                  texts: { url: "https://new.example" },
                  addresses: { eth: accounts.alice },
                },
                primaryName: true,
                onStep: chain.passWaits,
              });

              const text = yield* Actions.record.getText(ens, { name: "qqqqq.eth", key: "url" });
              assert.strictEqual(text, "https://new.example");
              const primaryNameAfterRegistration = yield* Actions.primaryName.get(ens, {
                address: accounts.alice,
              });
              assert.strictEqual(primaryNameAfterRegistration, "qqqqq.eth");
            }),
          );
        }),
      { meta: { cases: ["G25", "P26"] } },
    );

    it.effect(
      "registers several names, each at its price tier",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const names = ["qqq.eth", "qqqqq.eth"];
          const duration = Duration.years(1);

          yield* chain.isolated(
            Effect.gen(function* () {
              const quotes = yield* Effect.forEach(
                names,
                (name) => Actions.registration.getPrice(ens, { name, duration }),
                { concurrency: 1 },
              );

              const result = yield* Actions.registration.registerSync(ens, {
                names,
                duration,
                onStep: chain.passWaits,
              });

              assert.deepStrictEqual(
                Arr.map(result.names, ({ name }) => name),
                names,
              );
              assert.strictEqual(
                result.paid,
                Arr.reduce(quotes, 0n, (sum, quote) => sum + quote.total),
              );
              for (const name of names) {
                assert.strictEqual((yield* ethEntry(name)).owner, accounts.alice);
              }
            }),
          );
        }),
      { meta: { cases: ["M:C9"] } },
    );

    it.effect(
      "re-registers an expired name as a new token, without the old roles",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const expired = (yield* Fixtures).byId("v2.expired");
          const ens = clients.make({ account: accounts.bob });

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* Actions.registration.registerSync(ens, {
                names: expired.name,
                duration: Duration.years(1),
                onStep: chain.passWaits,
              });

              const entry = yield* ethEntry(expired.name);
              assert.strictEqual(entry.owner, accounts.bob);
              assert.notStrictEqual(entry.tokenId, BigInt(String(expired.facts["tokenId"])));
              const former = yield* Actions.role.get(ens, {
                account: accounts.alice,
                target: "registry",
                name: expired.name,
              });
              assert.deepStrictEqual(former.names, []);
            }),
          );
        }),
      { meta: { cases: ["O17", "M:A17"] } },
    );

    it.effect(
      "pays the premium of a recently released name",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const released = (yield* Fixtures).byId("registration.v2-premium").name;
          const ens = clients.make({ account: accounts.alice });
          const duration = Duration.years(1);

          yield* chain.isolated(
            Effect.gen(function* () {
              const quote = yield* Actions.registration.getPrice(ens, { name: released, duration });
              assert.isTrue(quote.premium > 0n);

              const result = yield* Actions.registration.registerSync(ens, {
                names: released,
                duration,
                onStep: chain.passWaits,
              });

              // The premium decays every second between the quote and the reveal.
              assert.isTrue(result.paid > quote.base && result.paid <= quote.total);
            }),
          );
        }),
      { meta: { cases: ["G14"] } },
    );

    // ETHRegistry mints with an ERC-1155 safe transfer, so an EIP-7702 EOA accepts the name only
    // if its delegate's code does. This one delegates to a receiver mock whose configuration
    // lives in storage the EOA does not have. ensforge does not pre-check the owner (KL-20): the
    // commit is sent, and the register step fails in simulation.
    it.effect(
      "fails the register step when the owner's delegated code rejects the name's token",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const owner = String((yield* Fixtures).byId("account.eip7702").facts["account"]);
          const wallet = (yield* Wallets).make(accounts.alice);
          const ens = clients.make({ account: accounts.alice, wallet });

          yield* chain.isolated(
            Effect.gen(function* () {
              const error = yield* expectFailure(
                Actions.registration.registerSync(ens, {
                  names: "qqqqq.eth",
                  duration: Duration.years(1),
                  owner,
                  onStep: chain.passWaits,
                }),
                { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" },
              );
              assert.strictEqual(error.errorName, "ERC1155InvalidReceiver");
              assert.deepStrictEqual(
                Arr.filter(wallet.methods, (method) => method === "eth_sendTransaction"),
                ["eth_sendTransaction"],
                "the commit only",
              );
              const availableAfterCommit = yield* Actions.registration.isAvailable(ens, {
                name: "qqqqq.eth",
              });
              assert.isTrue(availableAfterCommit);
            }),
          );
        }),
      { meta: { cases: ["A03"] } },
    );

    it.effect(
      "refuses names that cannot be registered before the wallet is asked",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const clients = yield* Clients;
          const fixtures = yield* Fixtures;
          const ens = clients.make({ account: accounts.alice });

          yield* expectFailure(
            Actions.registration.register(ens, {
              names: fixtures.byId("v2.registered").name,
              duration: Duration.years(1),
            }),
            { _tag: "NameStateError", code: "NAME_NOT_AVAILABLE" },
          );
          yield* expectFailure(
            Actions.registration.register(ens, { names: "qqqqq.eth", duration: Duration.days(1) }),
            { _tag: "InvalidInputError", code: "DURATION_TOO_SHORT" },
          );
          yield* expectFailure(
            Actions.registration.register(ens, { names: "qq.eth", duration: Duration.years(1) }),
            { _tag: "InvalidInputError", code: "INVALID_NAME" },
          );
          // Records need a resolver to hold them.
          yield* expectFailure(
            Actions.registration.register(ens, {
              names: "qqqqq.eth",
              duration: Duration.years(1),
              resolver: null,
              records: { texts: { url: "https://new.example" } },
            }),
            { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
          );
        }),
      { meta: { cases: ["G09", "G22"] } },
    );

    it.effect(
      "refuses to reveal once someone else registered the name, without asking the wallet",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const wallets = yield* Wallets;
          const wallet = wallets.make(accounts.alice);
          const ens = clients.make({ account: accounts.alice, wallet });
          const options = { names: "qqqqq.eth", duration: Duration.years(1) } as const;

          yield* chain.isolated(
            Effect.gen(function* () {
              const { secret } = yield* Actions.registration.commitSync(ens, options);
              // Bob commits and reveals in the meantime; his wait also matures Alice's commitment.
              yield* Actions.registration.registerSync(clients.make({ account: accounts.bob }), {
                ...options,
                onStep: chain.passWaits,
              });
              const prompts = wallet.methods.length;

              yield* expectFailure(Actions.registration.register(ens, { ...options, secret }), {
                _tag: "NameStateError",
                code: "NAME_NOT_AVAILABLE",
              });
              assert.strictEqual(wallet.methods.length, prompts, "the wallet was not asked again");
            }),
          );
        }),
      { meta: { cases: ["G19"] } },
    );

    it.effect(
      "reveals a commitment paying with another token than the one quoted",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice } = devnet.accounts;
          const ens = clients.make({ account: alice });
          const options = { names: "qqqqq.eth", duration: Duration.years(1) } as const;
          const dai = devnet.contract("v2.dai");
          const daiBalance = chain.read({
            address: dai,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [alice],
          });

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.write({
                address: dai,
                abi: parseAbi(["function mint(address to, uint256 amount)"]),
                functionName: "mint",
                args: [alice, 10n ** 24n],
                account: alice,
              });
              // Committed while quoting the USDC default: the commitment names no token.
              const { secret, readyAt } = yield* Actions.registration.commitSync(ens, options);
              yield* chain.setNextBlockTimestamp(readyAt);
              yield* chain.mine();
              const before = yield* daiBalance;

              const result = yield* Actions.registration.registerSync(ens, {
                ...options,
                secret,
                paymentToken: "dai",
              });

              assert.notInclude(
                Arr.map(result.plan.steps, (step) => step.id),
                "commit",
              );
              assert.strictEqual((yield* ethEntry("qqqqq.eth")).owner, alice);
              assert.strictEqual(before - (yield* daiBalance), result.paid);
            }),
          );
        }),
      { meta: { cases: ["G08"] } },
    );

    it.effect(
      "pays a price that rose after the quote, up to the 2% its approval leaves",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { user2, owner } = devnet.accounts;
          // An account without a standing allowance: the plan approves the quote and 2% more.
          const ens = clients.make({ account: user2 });
          const options = { names: "qqqqq.eth", duration: Duration.years(1) } as const;
          const usdc = devnet.contract("v2.usdc");
          const oracle = {
            address: devnet.contract("v2.rentPriceOracle"),
            abi: Abis.v2.standardRentPriceOracle,
          } as const;
          const [numer, denom] = yield* chain.read({
            ...oracle,
            functionName: "getPaymentTokenRatio",
            args: [usdc],
          });
          const context = yield* Effect.context();
          const fork = Effect.runForkWith(context);
          // Raises USDC's price by `percent` while the commitment matures, then passes the wait.
          const registerAsPriceRises = (percent: bigint) =>
            Actions.registration.registerSync(ens, {
              ...options,
              onStep: (event) => {
                if (event.status !== "waiting") return;
                fork(
                  chain
                    .write({
                      ...oracle,
                      functionName: "updatePaymentToken",
                      args: [usdc, numer * (100n + percent), denom * 100n],
                      account: owner,
                    })
                    .pipe(
                      Effect.andThen(chain.increaseTime(Number(event.step.waitFor?.seconds ?? 0n))),
                      Effect.andThen(chain.mine()),
                    ),
                );
              },
            });

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* mintUsdc(user2, 10n ** 12n);
              const quote = yield* Actions.registration.getPrice(ens, {
                name: options.names,
                duration: options.duration,
              });

              const result = yield* registerAsPriceRises(1n);

              assert.isTrue(
                result.paid > quote.total && result.paid <= (quote.total * 101n) / 100n + 1n,
              );
              assert.strictEqual((yield* ethEntry("qqqqq.eth")).owner, user2);
            }),
          );
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* mintUsdc(user2, 10n ** 12n);

              // Beyond the headroom the reveal fails on the allowance (KL-22).
              const error = yield* expectFailure(registerAsPriceRises(5n), {
                _tag: "InsufficientFundsError",
                code: "INSUFFICIENT_TOKEN_BALANCE",
              });
              assert.strictEqual(error.context.revert?.errorName, "ERC20InsufficientAllowance");
            }),
          );
        }),
      { meta: { cases: ["G15"] } },
    );

    it.effect(
      "pays with a token that returns nothing, and fails typed when a token refuses the payment",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { user2, owner } = devnet.accounts;
          const ens = clients.make({ account: user2 });
          const token = parseAbi([
            "function mint(address to, uint256 amount)",
            "function setBlacklisted(address account, bool blacklisted)",
          ]);
          // Each mock token, with the oracle ratio for its decimals and the revert it ends with.
          const tokens = [
            ["mock.voidReturnToken", 1n, 10n, undefined],
            ["mock.falseReturnToken", 10n, 1n, "SafeERC20FailedOperation"],
            ["mock.blacklistToken", 1n, 10n ** 6n, "Blacklisted"],
          ] as const;

          for (const [key, numer, denom, revert] of tokens) {
            const address = devnet.contract(key);
            yield* chain.isolated(
              Effect.gen(function* () {
                yield* chain.write({
                  address: devnet.contract("v2.rentPriceOracle"),
                  abi: Abis.v2.standardRentPriceOracle,
                  functionName: "updatePaymentToken",
                  args: [address, numer, denom],
                  account: owner,
                });
                yield* chain.write({
                  address,
                  abi: token,
                  functionName: "mint",
                  args: [user2, 10n ** 30n],
                  account: owner,
                });
                if (revert === "Blacklisted") {
                  yield* chain.write({
                    address,
                    abi: token,
                    functionName: "setBlacklisted",
                    args: [user2, true],
                    account: owner,
                  });
                }

                const register = Actions.registration.registerSync(ens, {
                  names: "qqqqq.eth",
                  duration: Duration.years(1),
                  paymentToken: address,
                  onStep: chain.passWaits,
                });

                if (revert === undefined) {
                  yield* register;
                  assert.strictEqual((yield* ethEntry("qqqqq.eth")).owner, user2, key);
                  return;
                }
                const error = yield* expectFailure(register, {
                  _tag: "ContractRevertError",
                  code: "CONTRACT_REVERTED",
                });
                // `Blacklisted` is the token's own error, outside the ENS ABI: its data is kept.
                assert.strictEqual(
                  error.errorName,
                  revert === "Blacklisted" ? undefined : revert,
                  key,
                );
              }),
            );
          }
        }),
      { meta: { cases: ["G16"] } },
    );

    it.effect(
      "fails typed when the owner is a contract that refuses the name token",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: devnet.accounts.alice });

          // A contract without `onERC1155Received`, as a DAO timelock. ensforge does not check
          // the owner before committing (KL-20): the reveal reverts.
          const error = yield* chain.isolated(
            expectFailure(
              Actions.registration.registerSync(ens, {
                names: "qqqqq.eth",
                duration: Duration.years(1),
                owner: devnet.contract("mock.ownable"),
                resolver: null,
                onStep: chain.passWaits,
              }),
              { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" },
            ),
          );
          assert.strictEqual(error.errorName, "ERC1155InvalidReceiver");
        }),
      { meta: { cases: ["G18"] } },
    );

    it.effect(
      "deploys the signer's shared resolver once, and reuses it for later names",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.alice });
          const register = (name: string) =>
            Actions.registration.registerSync(ens, {
              names: name,
              duration: Duration.years(1),
              resolver: "owned",
              records: { texts: { url: `https://${name}` } },
              onStep: chain.passWaits,
            });

          yield* chain.isolated(
            Effect.gen(function* () {
              const first = yield* register("qqqqq.eth");
              const second = yield* register("rrrrr.eth");

              // The first reveal also deploys the resolver; the second only registers.
              const callsOf = (result: typeof first) =>
                Option.getOrUndefined(
                  Option.map(
                    Arr.findFirst(result.plan.steps, (step) => step.id === "register"),
                    (step) => step.calls.length,
                  ),
                );
              assert.deepStrictEqual([callsOf(first), callsOf(second)], [2, 1]);
              const [one, two] = yield* Effect.all(
                [
                  Actions.resolver.get(ens, { name: "qqqqq.eth" }),
                  Actions.resolver.get(ens, { name: "rrrrr.eth" }),
                ],
                { concurrency: 1 },
              );
              assert.strictEqual(one?.address, two?.address);
              const text = yield* Actions.record.getText(ens, { name: "rrrrr.eth", key: "url" });
              assert.strictEqual(text, "https://rrrrr.eth");
              // The ENS app uses this resolver only when the signer holds the full role mask.
              const complete = yield* chain.read({
                address: one?.address ?? zeroAddress,
                abi: Abis.v2.permissionedResolver,
                functionName: "hasRootRoles",
                args: [Roles.enhancedAccessControl.allRoles, accounts.alice],
              });
              assert.isTrue(complete);
            }),
          );
        }),
      { meta: { cases: ["G29"] } },
    );

    it.effect(
      "reuses a shared resolver created by ensforge 1.1, whose roles cannot be widened",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const { accounts } = devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const ens = clients.make({ account: accounts.user });

          yield* chain.isolated(
            Effect.gen(function* () {
              // ensforge 1.1 granted the roles defined then, and their admins, not the full mask.
              const factory = devnet.contract("v2.verifiableFactory");
              yield* chain.write({
                address: factory,
                abi: Abis.v2.verifiableFactory,
                functionName: "deployProxy",
                args: [
                  devnet.contract("v2.permissionedResolverImplementation"),
                  ownedResolverSalt(accounts.user),
                  encodeFunctionData({
                    abi: Abis.v2.permissionedResolver,
                    functionName: "initialize",
                    args: [
                      [
                        {
                          account: accounts.user,
                          roleBitmap: Arr.reduce(
                            Rec.values(Roles.resolver),
                            0n,
                            (bitmap, role) => bitmap | role,
                          ),
                        },
                      ],
                      [],
                    ],
                  }),
                ],
                account: accounts.user,
              });
              const proxyLogic = yield* chain.read({
                address: factory,
                abi: Abis.v2.verifiableFactory,
                functionName: "proxyLogic",
              });
              const resolver = predictVerifiableProxyAddress({
                factory,
                proxyLogic,
                deployer: accounts.user,
                salt: ownedResolverSalt(accounts.user),
              });

              // The admin roles of the undefined bits were never granted, so nobody can grant them.
              const widened = yield* Effect.flip(
                Effect.asVoid(
                  chain.simulate({
                    address: resolver,
                    abi: Abis.v2.permissionedResolver,
                    functionName: "grantRootRoles",
                    args: [Roles.enhancedAccessControl.allRoles, accounts.user],
                    account: accounts.user,
                  }),
                ),
              );
              assert.include(String(widened.cause), "EACCannotGrantRoles");

              yield* mintUsdc(accounts.user, 1_000_000_000n);
              const plan = yield* Actions.registration.register.prepare(ens, {
                names: "partial-roles.eth",
                duration: Duration.years(1),
                resolver: "owned",
              });
              assert.deepStrictEqual(
                Arr.map(plan.warnings, (warning) => warning.code),
                ["RESOLVER_ROLES_PARTIAL"],
              );
            }),
          );
        }),
      { meta: { cases: ["G29"] } },
    );
  });
});
