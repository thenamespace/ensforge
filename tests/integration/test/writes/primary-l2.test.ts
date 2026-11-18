import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { CoinType, Plan } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import {
  encodeFunctionData,
  isErc6492Signature,
  parseAbi,
  serializeErc6492Signature,
  type Address,
} from "viem";
import { toAccount, mnemonicToAccount } from "viem/accounts";

import { Clients } from "../support/clients.ts";
import { chainServices } from "../support/lane.ts";
import { Optimism } from "../support/optimism.ts";

// L2 primary names on a second anvil answering as OP Mainnet: set on the L2 by the signer or by a
// relayer with a signed claim, and read back on the devnet through `8000000a.reverse`.

const optimism = { chainId: 10 } as const;
const optimismCoin = String(CoinType.fromChainId(10));

const services = Optimism.layer.pipe(
  Layer.provideMerge(chainServices),
  Layer.provideMerge(Fixtures.layer({ profile: "mainnet-shaped" })),
);

describe("primaryName.set on an L2", () => {
  layer(services, { excludeTestServices: true })("mainnet-shaped", (it) => {
    it.effect(
      "sets the signer's L2 primary name on the L2, read back on Ethereum",
      () =>
        Effect.gen(function* () {
          const op = yield* Optimism;
          const clients = yield* Clients;
          const { alice, bob } = (yield* Devnet).accounts;
          const name = (yield* Fixtures).byId("records.v1").name;
          const ens = clients.make({ account: alice, chains: op.chains(alice) });

          yield* op.isolated(
            Effect.gen(function* () {
              yield* Actions.record.setSync(ens, { name, addresses: { [optimismCoin]: alice } });
              const { plan } = yield* Actions.primaryName.setSync(ens, { name, coin: optimism });

              assert.strictEqual(plan.chainId, op.chainId);
              assert.strictEqual(yield* op.nameOf(alice), name);
              for (const coin of [optimism, "op"] as const) {
                assert.strictEqual(
                  yield* Actions.primaryName.get(clients.reader, { address: alice, coin }),
                  name,
                );
              }

              // The registrar lets only the address itself, or its Ownable owner, name it.
              yield* expectFailure(
                Actions.primaryName.set(ens, { name, address: bob, coin: optimism, verify: false }),
                { _tag: "UnauthorizedError", code: "NOT_APPROVED" },
              );
            }),
          );
        }),
      { meta: { cases: ["P33", "P38"] } },
    );

    it.effect(
      "submits one signed claim from a relayer, for an EOA, ERC-1271 and ERC-6492 accounts and an Ownable",
      () =>
        Effect.gen(function* () {
          const op = yield* Optimism;
          const clients = yield* Clients;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { alice, bob, carol, user } = devnet.accounts;
          const name = (yield* Fixtures).byId("records.v1").name;
          const owner = clients.make({ account: alice });
          const relayer = clients.make({ account: carol, chains: op.chains(carol) });
          const wallet = devnet.contract("mock.smartContractWallet");
          const ownable = devnet.contract("mock.ownable");
          // The smart account signs as itself; its owner's key makes the ERC-1271 signature.
          const userKey = mnemonicToAccount(
            "test test test test test test test test test test test junk",
            { addressIndex: 2 },
          );
          const smartAccount = toAccount({
            address: wallet,
            signMessage: ({ message }) => userKey.signMessage({ message }),
            signTransaction: () => Promise.reject(new Error("signs messages only")),
            signTypedData: () => Promise.reject(new Error("signs messages only")),
          });
          // A smart account not deployed yet on either chain (ERC-6492): it signs with its owner's
          // ERC-1271 signature, wrapped with the factory call that would deploy it.
          const factory = devnet.contract("mock.erc6492WalletFactory");
          const factoryAbi = parseAbi([
            "function predictAddress(address owner) view returns (address)",
            "function createWallet(address owner) returns (address)",
          ]);
          const counterfactual = yield* chain.read({
            address: factory,
            abi: factoryAbi,
            functionName: "predictAddress",
            args: [user],
          });
          const undeployedAccount = toAccount({
            address: counterfactual,
            signMessage: ({ message }) =>
              userKey.signMessage({ message }).then((signature) =>
                serializeErc6492Signature({
                  address: factory,
                  data: encodeFunctionData({
                    abi: factoryAbi,
                    functionName: "createWallet",
                    args: [user],
                  }),
                  signature,
                }),
              ),
            signTransaction: () => Promise.reject(new Error("signs messages only")),
            signTypedData: () => Promise.reject(new Error("signs messages only")),
          });

          const claimAndRead = (signer: Parameters<typeof clients.make>[0], named: Address) =>
            Effect.gen(function* () {
              yield* Actions.record.setSync(owner, { name, addresses: { [optimismCoin]: named } });
              // The L2 in `chains` only sets the claim's clock; the signer sends nothing there.
              const signed = yield* Actions.primaryName.signClaim(
                clients.make({ ...signer, chains: op.chains(carol) }),
                {
                  name,
                  chainIds: [op.chainId],
                  ...(signer.account === user ? { address: named } : {}),
                },
              );
              yield* Actions.primaryName.setSync(relayer, signed);

              assert.strictEqual(yield* op.nameOf(named), name);
              assert.strictEqual(
                yield* Actions.primaryName.get(clients.reader, { address: named, coin: optimism }),
                name,
              );
              return signed;
            });

          yield* op.isolated(
            Effect.gen(function* () {
              const signed = yield* claimAndRead({ account: bob }, bob);
              assert.deepInclude(signed.claim, { address: bob, name, chainIds: [op.chainId] });
              assert.isUndefined(signed.claim.owner);

              yield* claimAndRead({ account: smartAccount }, wallet);
              assert.isUndefined(yield* chain.code(counterfactual));
              const wrapped = yield* claimAndRead({ account: undeployedAccount }, counterfactual);
              assert.isTrue(isErc6492Signature(wrapped.signature));
              const byOwner = yield* claimAndRead({ account: user }, ownable);
              assert.strictEqual(byOwner.claim.owner, user);
            }),
          );
        }),
      { meta: { cases: ["P34", "P35", "P36"] } },
    );

    it.effect(
      "rejects expired, tampered and misdirected claims, and claims for other names",
      () =>
        Effect.gen(function* () {
          const op = yield* Optimism;
          const clients = yield* Clients;
          const { alice, bob, carol } = (yield* Devnet).accounts;
          const name = (yield* Fixtures).byId("records.v1").name;
          const signer = clients.make({ account: bob });
          const relayer = clients.make({ account: carol, chains: op.chains(carol) });

          yield* op.isolated(
            Effect.gen(function* () {
              // records.v1 has no OP Mainnet address: bob's comes from its default EVM address.
              const signed = yield* Actions.primaryName.signClaim(signer, {
                name,
                chainIds: [op.chainId],
                expiresIn: 60n,
              });

              const tampered = { ...signed, claim: { ...signed.claim, name: "other.eth" } };
              const invalid = yield* expectFailure(
                Actions.primaryName.set(relayer, { ...tampered, verify: false }),
                { _tag: "UnauthorizedError", code: "SIGNATURE_INVALID" },
              );
              assert.strictEqual(invalid.context.revert?.errorName, "InvalidSignature");
              assert.strictEqual(invalid.context.chainId, op.chainId);
              yield* expectFailure(
                Actions.primaryName.set(relayer, { ...signed, coin: { chainId: 8453 } }),
                { _tag: "InvalidInputError", code: "INVALID_COIN_TYPE" },
              );

              yield* op.passTime(120);
              const expired = yield* expectFailure(Actions.primaryName.set(relayer, signed), {
                _tag: "UnauthorizedError",
                code: "SIGNATURE_EXPIRED",
              });
              assert.strictEqual(expired.context.revert?.errorName, "SignatureExpired");

              // The name must resolve to the claimant on the chain.
              yield* Actions.record.setSync(clients.make({ account: alice }), {
                name,
                addresses: { [optimismCoin]: alice },
              });
              yield* expectFailure(
                Actions.primaryName.signClaim(signer, { name, chainIds: [op.chainId] }),
                { _tag: "NotFoundError", code: "PRIMARY_NAME_MISMATCH" },
              );
            }),
          );
        }),
      { meta: { cases: ["P09", "P37"] } },
    );

    it.effect(
      "fails before sending for chains it cannot reach and claims it cannot sign",
      () =>
        Effect.gen(function* () {
          const clients = yield* Clients;
          const { alice } = (yield* Devnet).accounts;
          const name = (yield* Fixtures).byId("records.v1").name;
          const ens = clients.make({ account: alice });

          yield* expectFailure(Actions.primaryName.set(ens, { name, coin: optimism }), {
            _tag: "ConfigError",
            code: "CHAIN_NOT_CONFIGURED",
          });
          yield* expectFailure(Actions.primaryName.set(ens, { name, coin: { chainId: 777 } }), {
            _tag: "UnsupportedError",
            code: "UNSUPPORTED_ON_DEPLOYMENT",
          });
          yield* expectFailure(Actions.primaryName.set(ens, { name, coin: "btc" }), {
            _tag: "InvalidInputError",
            code: "INVALID_COIN_TYPE",
          });

          for (const [options, code] of [
            [{ chainIds: [] }, "INVALID_COIN_TYPE"],
            [{ chainIds: [ens.chain.id] }, "INVALID_COIN_TYPE"],
            // A mainnet L2 and a testnet have different registrars.
            [{ chainIds: [10, 84532] }, "INVALID_COIN_TYPE"],
            [{ chainIds: [10], expiresIn: 7200n }, "INVALID_DURATION"],
            [{ chainIds: [10], address: "0x1234" }, "INVALID_ADDRESS"],
          ] as const) {
            yield* expectFailure(Actions.primaryName.signClaim(ens, { name, ...options }), {
              _tag: "InvalidInputError",
              code,
            });
          }
          yield* expectFailure(Actions.primaryName.signClaim(ens, { name, chainIds: [777] }), {
            _tag: "UnsupportedError",
            code: "UNSUPPORTED_ON_DEPLOYMENT",
          });
          yield* expectFailure(
            Actions.primaryName.signClaim(clients.reader, { name, chainIds: [10] }),
            { _tag: "ConfigError", code: "WALLET_NOT_CONFIGURED" },
          );
        }),
      { meta: { cases: ["P39"] } },
    );

    it.effect(
      "resumes a saved L2 plan on the L2",
      () =>
        Effect.gen(function* () {
          const op = yield* Optimism;
          const clients = yield* Clients;
          const { alice } = (yield* Devnet).accounts;
          const name = (yield* Fixtures).byId("records.v1").name;
          const storage = Plan.memoryStorage();
          const rejecting = clients.make({
            account: alice,
            storage,
            chains: op.chains(alice, { reject: true }),
          });
          const ens = clients.make({ account: alice, storage, chains: op.chains(alice) });

          yield* op.isolated(
            Effect.gen(function* () {
              yield* Actions.record.setSync(ens, { name, addresses: { [optimismCoin]: alice } });
              const rejected = yield* expectFailure(
                Actions.primaryName.set(rejecting, { name, coin: optimism }),
                { _tag: "UserRejectedError" },
              );
              const id = rejected.context.planId ?? assert.fail("a failed write names its plan");

              const { receipt, plan } = yield* Actions.plan.resumeSync(ens, { id });

              assert.strictEqual(plan.chainId, op.chainId);
              assert.strictEqual(receipt.status, "success");
              assert.strictEqual(yield* op.nameOf(alice), name);
              assert.include(
                (yield* Actions.plan.list(ens, { status: "completed" })).map(
                  (saved) => saved.plan.id,
                ),
                id,
              );
            }),
          );
        }),
      { meta: { cases: ["P40"] } },
    );
  });
});
