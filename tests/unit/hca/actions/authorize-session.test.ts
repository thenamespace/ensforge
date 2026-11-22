import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { defineExecutor, type Executor } from "@ensforge/hca";
import { Actions } from "@ensforge/hca/effect";
import { expectFailure } from "@ensforge/test-harness";

import { hcaAddress, makeClient, owner, ownerSignature, v2 } from "../fixtures";

// The owner approves a session with one typed-data signature, so the HCA need not exist yet: the
// session names the address the factory will create, and the validator checks the approval when
// the account is first used.
describe("hca.authorizeSession on an HCA that is not deployed", () => {
  it.effect("signs for the predicted address and sends no transaction", () =>
    Effect.gen(function* () {
      const { client, calls } = makeClient({ wallet: true });
      const resolver = "0x00000000000000000000000000000000000000bb";

      const session = yield* Actions.hca.authorizeSession(client, {
        sessionKey: "0x00000000000000000000000000000000000000cc",
        resolver,
        validUntil: 4_000_000_000,
      });

      assert.strictEqual(session.hca, hcaAddress);
      assert.strictEqual(session.owner, owner);
      assert.strictEqual(session.terms.sessionNonce, 0n);
      assert.strictEqual(session.ownerSignature, ownerSignature);
      assert.isFalse(
        Arr.some(
          calls,
          ({ method }) => method === "eth_sendTransaction" || method === "wallet_sendCalls",
        ),
      );
    }),
  );
});

// Approvals are signed under the smart-session domain only; the `"hca"` domain's name and version
// are not known, so a deployment that expects it is refused before the wallet is asked.
describe("hca.authorizeSession on a deployment ensforge cannot sign for", () => {
  it.effect("refuses the hca session domain", () =>
    Effect.gen(function* () {
      const { sepolia } = Deployments;
      const deployment = {
        ...sepolia,
        v2: {
          ...sepolia.v2,
          capabilities: { ...sepolia.v2.capabilities, hcaSessionDomain: "hca" },
        },
      } as const;
      const { client, calls } = makeClient({ wallet: true, deployment });

      yield* expectFailure(
        Actions.hca.authorizeSession(client, {
          sessionKey: "0x00000000000000000000000000000000000000cc",
          resolver: "0x00000000000000000000000000000000000000bb",
          validUntil: 4_000_000_000,
        }),
        { _tag: "HcaError", code: "HCA_UNAVAILABLE" },
      );
      assert.isFalse(Arr.some(calls, ({ method }) => method === "eth_signTypedData_v4"));
    }),
  );
});

/** An executor that only quotes refunds. */
const quoting = (quoteRefund: Executor["quoteRefund"]): Executor =>
  defineExecutor({
    id: "quoting",
    capabilities: { sessions: true, sponsorship: true, deploys: true },
    quoteRefund,
  });

// The gas-overhead cap bounds what a relayer may charge per intent, so it is sized from a quote.
describe("hca.authorizeSession refund caps", () => {
  const options = {
    sessionKey: "0x00000000000000000000000000000000000000cc",
    resolver: "0x00000000000000000000000000000000000000bb",
    validUntil: 4_000_000_000,
  } as const;
  const refund = { token: v2.paymentTokens.usdc, exchangeRate: 1n, amount: 1n };

  it.effect.each([
    [
      "a quote",
      quoting(() => Promise.resolve({ ...refund, gasOverhead: 3_000_000n })),
      12_000_000n,
    ],
    ["a failed quote", quoting(() => Promise.reject(new Error("offline"))), 500_000n],
    ["no executor", undefined, 500_000n],
  ] as const)("sizes the overhead cap from %s", ([, executor, cap]) =>
    Effect.gen(function* () {
      const { client } = makeClient({ wallet: true });

      const session = yield* Actions.hca.authorizeSession(client, { ...options, executor });

      assert.strictEqual(session.terms.maxRefundGasOverhead, cap);
    }),
  );

  it.effect("keeps an explicit overhead cap, and refuses one the validator cannot store", () =>
    Effect.gen(function* () {
      const { client } = makeClient({ wallet: true });
      const executor = quoting(() => Promise.resolve({ ...refund, gasOverhead: 3_000_000n }));

      const session = yield* Actions.hca.authorizeSession(client, {
        ...options,
        executor,
        refund: { maxGasOverhead: 1_000n },
      });
      assert.strictEqual(session.terms.maxRefundGasOverhead, 1_000n);

      yield* expectFailure(
        Actions.hca.authorizeSession(client, { ...options, refund: { maxGasOverhead: 1n << 48n } }),
        { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
      );
    }),
  );
});
