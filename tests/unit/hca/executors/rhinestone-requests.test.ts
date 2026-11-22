import { assert, describe, it } from "@effect/vitest";
import { Effect, String as Str } from "effect";

import { Deployments } from "@ensforge/contracts";
import { hcaSessionSalt } from "@ensforge/contracts/v2/experimental/hca";
import { rhinestone, type RhinestoneSdk } from "@ensforge/hca/internal/executors/rhinestone";
import type { ExecutionRequest, HcaSession } from "@ensforge/hca/internal/types";
import type { Write } from "@ensforge/sdk";
import { expectRejection, noRpc, scriptedTransport } from "@ensforge/test-harness";
import { concat, createWalletClient, zeroAddress, zeroHash, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { defined, hcaAddress, makeClient, owner, proxyLogic, v2 } from "../fixtures";

// What the Rhinestone SDK is asked to do: the account it derives and the transactions it prepares.

const ownerAccount = privateKeyToAccount(`0x${Str.repeat(32)("22")}`);
const sessionSigner = privateKeyToAccount(`0x${Str.repeat(32)("33")}`);
const refundToken: Address = "0x00000000000000000000000000000000000000cc";

/** An SDK that derives `hcaAddress` and records every account config and transaction. */
const recordingSdk = () => {
  const configs: unknown[] = [];
  const prepared: unknown[] = [];
  const sdk: RhinestoneSdk = {
    createAccount: (config) => {
      configs.push(config);
      return Promise.resolve({
        getAddress: () => hcaAddress,
        prepareTransaction: (transaction) => {
          prepared.push(transaction);
          return Promise.resolve(transaction);
        },
        signTransaction: (transaction) => Promise.resolve(transaction),
        submitTransaction: () => Promise.resolve({ id: 7n }),
      });
    },
    getIntentStatus: () => Promise.resolve({ status: "PENDING" }),
  };
  return { sdk, configs, prepared };
};

const { transport } = scriptedTransport(noRpc);

const contextFor = (options: Parameters<typeof makeClient>[0] = {}): Write.Via.Context => ({
  ...makeClient({ deployed: true, ...options }).context,
  walletClient: createWalletClient({ account: ownerAccount, chain: sepolia, transport }),
});

const request: ExecutionRequest = {
  chainId: 11155111,
  hca: hcaAddress,
  owner,
  deployed: false,
  calls: [{ to: owner, data: "0xabcd", value: 3n }],
  description: "test",
};

const session: HcaSession = {
  chainId: 11155111,
  hca: hcaAddress,
  owner,
  sessionKey: sessionSigner.address,
  terms: {
    sessionNonce: 0n,
    validUntil: 4_000_000_000,
    resolver: zeroAddress,
    refundToken,
    maxRefundExchangeRate: 1n,
    maxRefundGasOverhead: 1n,
    maxRefundAmount: 1n,
  },
  chains: [
    { chainId: 11155111, sessionDigest: zeroHash },
    { chainId: 1, sessionDigest: `0x${Str.repeat(32)("01")}` },
  ],
  permissionId: zeroHash,
  sessionDigest: zeroHash,
  ownerSignature: "0xabcd",
  signingDomain: "smart-session",
};

describe("rhinestone executor: requests", () => {
  it.effect("derives the owner's standalone HCA, sponsored by default", () =>
    Effect.gen(function* () {
      const { sdk, configs, prepared } = recordingSdk();
      const executor = rhinestone({ sdk });
      const send = defined(executor.send);

      const reference = yield* Effect.promise(() => send(request, contextFor()));
      yield* Effect.promise(() => send({ ...request, deployed: true }, contextFor()));

      assert.strictEqual(reference, "7");
      assert.strictEqual(executor.id, "rhinestone");
      assert.deepStrictEqual(executor.capabilities, {
        sessions: true,
        sponsorship: true,
        deploys: true,
      });
      const validator = v2.hca.ownerAndSessionValidator;
      const account = {
        type: "hca",
        version: "ens-standalone-1.1.0",
        factory: v2.hca.standaloneFactory,
        implementation: v2.hca.standaloneImplementation,
        validator,
        verifiableFactory: v2.contracts.verifiableFactory,
        proxyLogic,
        userSalt: 0n,
      };
      const owners = { type: "ecdsa", accounts: [ownerAccount], module: validator };
      const sessions = { enabled: true, module: validator };
      // A deployed HCA is named by its address.
      assert.deepStrictEqual(configs, [
        { account, owners, experimental_sessions: sessions },
        { initData: { address: hcaAddress }, account, owners, experimental_sessions: sessions },
      ]);
      assert.deepStrictEqual(prepared[0], {
        chain: contextFor().publicClient.chain,
        calls: [{ to: owner, data: "0xabcd", value: 3n }],
        sponsored: true,
      });
    }),
  );

  it.effect("enables the session's digests per chain, paying refunds when not sponsored", () =>
    Effect.gen(function* () {
      const { sdk, prepared } = recordingSdk();
      const executor = rhinestone({ sdk, sessionSigner, sponsored: false });

      yield* Effect.promise(() => defined(executor.send)({ ...request, session }, contextFor()));

      const chain = contextFor().publicClient.chain;
      assert.deepStrictEqual(prepared[0], {
        chain,
        calls: request.calls,
        sponsored: false,
        feeAsset: refundToken,
        signers: {
          type: "experimental_session",
          verifyExecutions: true,
          session: {
            chain,
            account: hcaAddress,
            salt: hcaSessionSalt(session.terms),
            owners: { type: "ecdsa", accounts: [sessionSigner] },
          },
          enableData: {
            userSignature: concat([zeroAddress, "0xabcd"]),
            hashesAndChainIds: [
              { chainId: 11155111n, sessionDigest: zeroHash },
              { chainId: 1n, sessionDigest: `0x${Str.repeat(32)("01")}` },
            ],
            sessionToEnableIndex: 0,
            // The ENS SDK patch packs these into the proof the validator checks.
            hcaSessionNonce: 0n,
            hcaSessionConfig: {
              sessionKey: sessionSigner.address,
              validUntil: 4_000_000_000,
              resolver: zeroAddress,
              refundToken,
              maxRefundExchangeRate: 1n,
              maxRefundGasOverhead: 1,
              maxRefundAmount: 1n,
            },
          },
        },
      });
    }),
  );

  // Rhinestone signs with the account itself; a browser wallet's signs through the wallet.
  it.effect("signs as a browser wallet's account through the wallet client", () =>
    Effect.gen(function* () {
      const { sdk, configs } = recordingSdk();
      const executor = rhinestone({ sdk });
      const browser = {
        ...contextFor(),
        walletClient: createWalletClient({
          account: ownerAccount.address,
          chain: sepolia,
          transport,
        }),
      };

      yield* Effect.promise(() => defined(executor.send)(request, browser));

      const signer = Reflect.get(
        Reflect.get(Reflect.get(configs[0] ?? {}, "owners"), "accounts"),
        0,
      );
      assert.include(signer, { address: ownerAccount.address, type: "local" });
      assert.isFunction(Reflect.get(signer, "signTypedData"));
    }),
  );

  // Without a session the owner's wallet signs; no session signer is needed.
  it.effect("sends without a session signer when there is no session", () =>
    Effect.gen(function* () {
      const { sdk, prepared } = recordingSdk();
      const executor = rhinestone({ sdk, sponsored: false });

      yield* Effect.promise(() => defined(executor.send)(request, contextFor()));

      assert.notProperty(prepared[0], "feeAsset");
      assert.notProperty(prepared[0], "signers");
    }),
  );

  it.effect("refuses a session without a session signer, naming what is missing", () =>
    Effect.gen(function* () {
      const executor = rhinestone({ sdk: recordingSdk().sdk });

      const error = yield* expectRejection(
        () => defined(executor.send)({ ...request, session }, contextFor()),
        { _tag: "HcaError", code: "HCA_EXECUTOR_UNSUPPORTED" },
      );

      assert.strictEqual(Reflect.get(error, "executor"), "rhinestone");
      assert.strictEqual(
        Reflect.get(error, "shortMessage"),
        "Session executions need `sessionSigner`.",
      );
    }),
  );

  const { hca: _, ...v2WithoutHca } = Deployments.sepolia.v2;
  const { v2: __, ...withoutV2 } = Deployments.sepolia;

  it.effect.each<readonly [string, Write.Via.Context]>([
    [
      "a wallet with an account",
      { ...contextFor(), walletClient: createWalletClient({ chain: sepolia, transport }) },
    ],
    ["a wallet", { ...contextFor(), walletClient: undefined }],
    ["an HCA deployment", contextFor({ deployment: { ...Deployments.sepolia, v2: v2WithoutHca } })],
    ["ENSv2", contextFor({ deployment: withoutV2 })],
  ])("needs %s", ([, context]) =>
    Effect.gen(function* () {
      const { sdk, configs } = recordingSdk();
      const executor = rhinestone({ sdk });

      const error = yield* expectRejection(() => defined(executor.send)(request, context), {
        _tag: "HcaError",
        code: "HCA_EXECUTOR_UNSUPPORTED",
      });

      assert.strictEqual(Reflect.get(error, "executor"), "rhinestone");
      assert.deepStrictEqual(configs, []);
    }),
  );

  it.effect("refuses an SDK that derives another account, naming Rhinestone", () =>
    Effect.gen(function* () {
      const { sdk } = recordingSdk();
      const executor = rhinestone({
        sdk: {
          ...sdk,
          createAccount: (config) =>
            sdk.createAccount(config).then((account) => ({ ...account, getAddress: () => owner })),
        },
      });

      const error = yield* expectRejection(() => defined(executor.send)(request, contextFor()), {
        _tag: "HcaError",
        code: "HCA_SDK_UNSUPPORTED",
      });

      assert.strictEqual(Reflect.get(error, "executor"), "rhinestone");
    }),
  );
});
