import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { hcaSessionSalt } from "@ensforge/contracts/v2/experimental/hca";
import { rhinestone, type RhinestoneSdk } from "@ensforge/hca/internal/executors/rhinestone";
import type { ExecutionRequest, HcaSession } from "@ensforge/hca/internal/types";
import { expectRejection } from "@ensforge/test-harness";
import { concat, zeroAddress, zeroHash, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { hcaAddress, makeClient, owner } from "../fixtures";

const signer = privateKeyToAccount(`0x${"22".repeat(32)}`);

const defined = <value>(value: value | undefined): value => {
  assert.isDefined(value);
  return value as value;
};

const fakeSdk = (
  derived: Address,
  intent: Awaited<ReturnType<RhinestoneSdk["getIntentStatus"]>>,
) => {
  const prepared: unknown[] = [];
  const sdk: RhinestoneSdk = {
    createAccount: async () => ({
      getAddress: () => derived,
      prepareTransaction: async (transaction) => {
        prepared.push(transaction);
        return transaction;
      },
      signTransaction: async (transaction) => transaction,
      submitTransaction: async () => ({ id: 42n }),
    }),
    getIntentStatus: async () => intent,
  };
  return { sdk, prepared };
};

const contextFor = () => {
  const { context } = makeClient({ deployed: true });
  return { ...context, walletClient: { account: signer } as never };
};

const session = {
  hca: hcaAddress,
  owner,
  terms: {
    sessionNonce: 0n,
    validUntil: 4_000_000_000,
    resolver: zeroAddress,
    refundToken: zeroAddress,
    maxRefundExchangeRate: 1n,
    maxRefundGasOverhead: 1n,
    maxRefundAmount: 1n,
  },
  chains: [{ chainId: 11155111, sessionDigest: zeroHash }],
  ownerSignature: "0xabcd",
} as unknown as HcaSession;

const request: ExecutionRequest = {
  chainId: 11155111,
  hca: hcaAddress,
  owner,
  deployed: true,
  calls: [],
  description: "test",
};

describe("rhinestone executor", () => {
  it.effect("refuses an SDK that derives another HCA address", () =>
    expectRejection(
      () =>
        defined(rhinestone({ sdk: fakeSdk(zeroAddress, { status: "PENDING" }).sdk }).send)(
          request,
          contextFor(),
        ),
      { _tag: "HcaError", code: "HCA_SDK_UNSUPPORTED" },
    ),
  );

  it.effect("needs a session signer for session executions", () =>
    expectRejection(
      () =>
        defined(rhinestone({ sdk: fakeSdk(hcaAddress, { status: "PENDING" }).sdk }).send)(
          { ...request, session },
          contextFor(),
        ),
      { _tag: "HcaError", code: "HCA_EXECUTOR_UNSUPPORTED" },
    ),
  );

  it.effect("enables the session with the owner's prefixed signature and its salt", () =>
    Effect.gen(function* () {
      const { sdk, prepared } = fakeSdk(hcaAddress, { status: "PENDING" });
      const executor = rhinestone({ sdk, sessionSigner: signer, sponsored: false });
      const id = yield* Effect.promise(() =>
        defined(executor.send)({ ...request, session }, contextFor()),
      );

      assert.strictEqual(id, "42");
      const [transaction] = prepared as unknown as readonly [
        {
          feeAsset?: Address;
          signers: { session: { salt: string }; enableData: { userSignature: string } };
        },
      ];
      assert.strictEqual(transaction.feeAsset, session.terms.refundToken);
      assert.strictEqual(transaction.signers.session.salt, hcaSessionSalt(session.terms));
      assert.strictEqual(
        transaction.signers.enableData.userSignature,
        concat([zeroAddress, session.ownerSignature]),
      );
    }),
  );

  it.effect.each([
    [
      "a filled intent",
      { status: "COMPLETED", fill: { hash: zeroHash } },
      { status: "success", hashes: [zeroHash] },
    ],
    ["a failed intent", { status: "FAILED" }, { status: "failed", reason: "the intent is failed" }],
    [
      "an expired intent",
      { status: "EXPIRED" },
      { status: "failed", reason: "the intent is expired" },
    ],
    ["an intent in flight", { status: "PRECONFIRMED" }, { status: "pending" }],
  ] as const)("reports %s", ([, intent, expected]) =>
    Effect.gen(function* () {
      const executor = rhinestone({ sdk: fakeSdk(hcaAddress, intent).sdk });
      const status = yield* Effect.promise(() => defined(executor.status)("42", contextFor()));
      assert.deepStrictEqual(status, expected);
    }),
  );
});
