import { assert, describe, it } from "@effect/vitest";
import { Effect, String as Str } from "effect";

import { hcaSessionSalt } from "@ensforge/contracts/v2/experimental/hca";
import { Actions } from "@ensforge/hca/effect";
import { rhinestone, type RhinestoneSdk } from "@ensforge/hca/internal/executors/rhinestone";
import { hca } from "@ensforge/hca/internal/hca";
import type { ExecutionRequest, HcaSession } from "@ensforge/hca/internal/types";
import type { Write } from "@ensforge/sdk";
import { expectFailure, expectRejection, noRpc, scriptedTransport } from "@ensforge/test-harness";
import {
  concat,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  zeroAddress,
  zeroHash,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { hcaAddress, makeClient, owner, v2 } from "../fixtures";

const signer = privateKeyToAccount(`0x${Str.repeat(32)("22")}`);

const fakeSdk = (
  derived: Address,
  intent: Awaited<ReturnType<RhinestoneSdk["getIntentStatus"]>>,
) => {
  const prepared: unknown[] = [];
  const sdk: RhinestoneSdk = {
    createAccount: () =>
      Promise.resolve({
        getAddress: () => derived,
        prepareTransaction: (transaction) => {
          prepared.push(transaction);
          return Promise.resolve(transaction);
        },
        signTransaction: (transaction) => Promise.resolve(transaction),
        submitTransaction: () => Promise.resolve({ id: 42n }),
      }),
    getIntentStatus: () => Promise.resolve(intent),
  };
  return { sdk, prepared };
};

const { transport } = scriptedTransport(noRpc);

const contextFor = (): Write.Via.Context => ({
  ...makeClient({ deployed: true }).context,
  walletClient: createWalletClient({ account: signer, chain: sepolia, transport }),
});

const session: HcaSession = {
  chainId: 11155111,
  hca: hcaAddress,
  owner,
  sessionKey: signer.address,
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
  permissionId: zeroHash,
  sessionDigest: zeroHash,
  ownerSignature: "0xabcd",
  signingDomain: "smart-session",
};

const request: ExecutionRequest = {
  chainId: 11155111,
  hca: hcaAddress,
  owner,
  deployed: true,
  calls: [],
  description: "test",
};

// Executors are Promise interfaces the write runtime calls, so these tests await them.
describe("rhinestone executor", () => {
  it.effect("refuses an SDK that derives another HCA address", () =>
    Effect.gen(function* () {
      const { send } = rhinestone({ sdk: fakeSdk(zeroAddress, { status: "PENDING" }).sdk });
      assert.isDefined(send);

      yield* expectRejection(() => send(request, contextFor()), {
        _tag: "HcaError",
        code: "HCA_SDK_UNSUPPORTED",
      });
    }),
  );

  it.effect("needs a session signer for session executions", () =>
    Effect.gen(function* () {
      const { send } = rhinestone({ sdk: fakeSdk(hcaAddress, { status: "PENDING" }).sdk });
      assert.isDefined(send);

      yield* expectRejection(() => send({ ...request, session }, contextFor()), {
        _tag: "HcaError",
        code: "HCA_EXECUTOR_UNSUPPORTED",
      });
    }),
  );

  it.effect("hca.execute refuses to run a session without a session signer", () =>
    Effect.gen(function* () {
      const { client } = makeClient({ deployed: true, wallet: true });
      const via = hca({
        executors: [rhinestone({ sdk: fakeSdk(hcaAddress, { status: "PENDING" }).sdk })],
        session,
      });
      // A payment approval to the registrar: within the session policy.
      const approve = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [v2.contracts.ethRegistrar, 1n],
      });

      const error = yield* expectFailure(
        Actions.hca.execute(client, {
          calls: [{ to: "0x00000000000000000000000000000000000000cc", data: approve }],
          via,
        }),
        { _tag: "HcaError", code: "HCA_EXECUTOR_UNSUPPORTED" },
      );

      assert.strictEqual(error.shortMessage, "Session executions need `sessionSigner`.");
    }),
  );

  it.effect("enables the session with the owner's prefixed signature and its salt", () =>
    Effect.gen(function* () {
      const { sdk, prepared } = fakeSdk(hcaAddress, { status: "PENDING" });
      const { send } = rhinestone({ sdk, sessionSigner: signer, sponsored: false });
      assert.isDefined(send);

      const id = yield* Effect.promise(() => send({ ...request, session }, contextFor()));

      assert.strictEqual(id, "42");
      const [transaction] = prepared;
      assert.propertyVal(transaction, "feeAsset", session.terms.refundToken);
      assert.nestedPropertyVal(transaction, "signers.session.salt", hcaSessionSalt(session.terms));
      assert.nestedPropertyVal(
        transaction,
        "signers.enableData.userSignature",
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
      const { status } = rhinestone({ sdk: fakeSdk(hcaAddress, intent).sdk });
      assert.isDefined(status);

      const reported = yield* Effect.promise(() => status("42", contextFor()));

      assert.deepStrictEqual(reported, expected);
    }),
  );
});
