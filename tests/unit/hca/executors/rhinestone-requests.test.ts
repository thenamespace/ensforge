import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { hcaSessionSalt } from "@ensforge/contracts/v2/experimental/hca";
import { rhinestone, type RhinestoneSdk } from "@ensforge/hca/internal/executors/rhinestone";
import type { ExecutionRequest, HcaSession } from "@ensforge/hca/internal/types";
import { expectRejection } from "@ensforge/test-harness";
import { concat, zeroAddress, zeroHash, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { hcaAddress, makeClient, owner, proxyLogic, v2 } from "../fixtures";

// What the Rhinestone SDK is asked to do: the account it derives and the transactions it prepares.

const ownerAccount = privateKeyToAccount(`0x${"22".repeat(32)}`);
const sessionSigner = privateKeyToAccount(`0x${"33".repeat(32)}`);
const refundToken: Address = "0x00000000000000000000000000000000000000cc";

/** An SDK that derives `hcaAddress` and records every account config and transaction. */
const recordingSdk = () => {
  const configs: unknown[] = [];
  const prepared: Record<string, unknown>[] = [];
  const sdk: RhinestoneSdk = {
    createAccount: async (config) => {
      configs.push(config);
      return {
        getAddress: () => hcaAddress,
        prepareTransaction: async (transaction) => {
          prepared.push(transaction as Record<string, unknown>);
          return transaction;
        },
        signTransaction: async (transaction) => transaction,
        submitTransaction: async () => ({ id: 7n }),
      };
    },
    getIntentStatus: async () => ({ status: "PENDING" }),
  };
  return { sdk, configs, prepared };
};

const contextFor = () => {
  const { context } = makeClient({ deployed: true });
  return { ...context, walletClient: { account: ownerAccount } as never };
};

const request: ExecutionRequest = {
  chainId: 11155111,
  hca: hcaAddress,
  owner,
  deployed: false,
  calls: [{ to: owner, data: "0xabcd", value: 3n }],
  description: "test",
};

const session = {
  hca: hcaAddress,
  owner,
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
    { chainId: 1, sessionDigest: `0x${"01".repeat(32)}` },
  ],
  ownerSignature: "0xabcd",
} as unknown as HcaSession;

describe("rhinestone executor: requests", () => {
  it.effect("derives the owner's standalone HCA, sponsored by default", () =>
    Effect.gen(function* () {
      const { sdk, configs, prepared } = recordingSdk();
      const executor = rhinestone({ sdk });
      const send = executor.send as NonNullable<typeof executor.send>;

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

      yield* Effect.promise(() =>
        (executor.send as NonNullable<typeof executor.send>)({ ...request, session }, contextFor()),
      );

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
              { chainId: 1n, sessionDigest: `0x${"01".repeat(32)}` },
            ],
            sessionToEnableIndex: 0,
          },
        },
      });
    }),
  );

  // Without a session the owner's wallet signs; no session signer is needed.
  it.effect("sends without a session signer when there is no session", () =>
    Effect.gen(function* () {
      const { sdk, prepared } = recordingSdk();
      const executor = rhinestone({ sdk, sponsored: false });

      yield* Effect.promise(() =>
        (executor.send as NonNullable<typeof executor.send>)(request, contextFor()),
      );

      assert.notProperty(prepared[0], "feeAsset");
      assert.notProperty(prepared[0], "signers");
    }),
  );

  it.effect("refuses a session without a session signer, naming what is missing", () =>
    Effect.gen(function* () {
      const executor = rhinestone({ sdk: recordingSdk().sdk });

      const error = yield* expectRejection(
        () =>
          (executor.send as NonNullable<typeof executor.send>)(
            { ...request, session },
            contextFor(),
          ),
        { _tag: "HcaError", code: "HCA_EXECUTOR_UNSUPPORTED" },
      );

      assert.strictEqual((error as { readonly executor?: string }).executor, "rhinestone");
      assert.strictEqual(
        (error as { readonly shortMessage?: string }).shortMessage,
        "Session executions need `sessionSigner`.",
      );
    }),
  );

  it.effect.each<readonly [string, ReturnType<typeof contextFor>]>([
    [
      "a wallet with an account",
      { ...contextFor(), walletClient: { account: undefined } as never },
    ],
    ["a wallet", { ...contextFor(), walletClient: undefined as never }],
    [
      "an HCA deployment",
      (() => {
        const context = contextFor();
        const client = context.client as unknown as {
          readonly deployment: { readonly v2: object };
        };
        return {
          ...context,
          client: {
            ...client,
            deployment: { ...client.deployment, v2: { ...client.deployment.v2, hca: undefined } },
          } as never,
        };
      })(),
    ],
    [
      "ENSv2",
      (() => {
        const context = contextFor();
        const client = context.client as unknown as { readonly deployment: object };
        return {
          ...context,
          client: { ...client, deployment: { ...client.deployment, v2: undefined } } as never,
        };
      })(),
    ],
  ])("needs %s", ([, context]) =>
    Effect.gen(function* () {
      const { sdk, configs } = recordingSdk();
      const executor = rhinestone({ sdk });

      const error = yield* expectRejection(
        () => (executor.send as NonNullable<typeof executor.send>)(request, context),
        { _tag: "HcaError", code: "HCA_EXECUTOR_UNSUPPORTED" },
      );

      assert.strictEqual((error as { readonly executor?: string }).executor, "rhinestone");
      assert.deepStrictEqual(configs, []);
    }),
  );

  it.effect("refuses an SDK that derives another account, naming Rhinestone", () =>
    Effect.gen(function* () {
      const { sdk } = recordingSdk();
      const executor = rhinestone({
        sdk: {
          ...sdk,
          createAccount: async (config) => ({
            ...(await sdk.createAccount(config)),
            getAddress: () => owner,
          }),
        },
      });

      const error = yield* expectRejection(
        () => (executor.send as NonNullable<typeof executor.send>)(request, contextFor()),
        { _tag: "HcaError", code: "HCA_SDK_UNSUPPORTED" },
      );

      assert.strictEqual((error as { readonly executor?: string }).executor, "rhinestone");
    }),
  );
});
