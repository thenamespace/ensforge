import { assert, describe, it } from "@effect/vitest";
import { Effect, String as Str } from "effect";

import { rhinestone, type RhinestoneSdk } from "@ensforge/hca/internal/executors/rhinestone";
import type { ExecutionRequest, HcaSession } from "@ensforge/hca/internal/types";
import type { Write } from "@ensforge/sdk";
import { expectRejection, noRpc, scriptedTransport } from "@ensforge/test-harness";
import {
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  pad,
  zeroAddress,
  zeroHash,
  type Address,
  type TypedDataDefinition,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { defined, hcaAddress, makeClient, owner, rhinestoneRoute, v2 } from "../fixtures";

// The orchestrator's route is untrusted: an owner-signed intent runs whatever it says, so the
// executor refuses to sign one that differs from the request.

const ownerAccount = privateKeyToAccount(`0x${Str.repeat(32)("22")}`);
const sessionSigner = privateKeyToAccount(`0x${Str.repeat(32)("33")}`);
const usdc = v2.paymentTokens.usdc;
const call = { to: owner, data: "0xabcd", value: 0n } as const;
const request: ExecutionRequest = {
  chainId: sepolia.id,
  hca: hcaAddress,
  owner,
  deployed: true,
  calls: [call],
  description: "test",
};
const refund = {
  token: usdc,
  exchangeRate: 1_000_000_000n,
  gasOverhead: 50_000n,
  amount: 300_000n,
};

/** An SDK whose orchestrator answers with `route`, recording whether anything was signed. */
const sdkAnswering = (
  route: unknown,
  messages?: {
    readonly origin: readonly TypedDataDefinition[];
    readonly destination: TypedDataDefinition;
  },
) => {
  const signed: unknown[] = [];
  const sdk: RhinestoneSdk = {
    createAccount: () =>
      Promise.resolve({
        getAddress: () => hcaAddress,
        prepareTransaction: () => Promise.resolve({ intentRoute: route }),
        signTransaction: (prepared) => {
          signed.push(prepared);
          return Promise.resolve(prepared);
        },
        submitTransaction: () => Promise.resolve({ id: 1n }),
        ...(messages === undefined ? {} : { getTransactionMessages: () => messages }),
      }),
    getIntentStatus: () => Promise.resolve({ status: "PENDING" }),
  };
  return { sdk, signed };
};

const context = (): Write.Via.Context => ({
  ...makeClient({ deployed: true }).context,
  walletClient: createWalletClient({
    account: ownerAccount,
    chain: sepolia,
    transport: scriptedTransport(noRpc).transport,
  }),
});

const feeApproval = (spender: Address, amount: bigint) => ({
  to: usdc,
  value: 0n,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
});

const intentMessage = (route: ReturnType<typeof rhinestoneRoute>, ops: readonly unknown[]) =>
  ({
    domain: {
      name: "IntentExecutor",
      version: "v0.0.1",
      chainId: sepolia.id,
      verifyingContract: defined(v2.hca).intentExecutor,
    },
    types: {
      SingleChainOps: [
        { name: "account", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "op", type: "Op" },
        { name: "gasRefund", type: "GasRefund" },
      ],
      Op: [
        { name: "vt", type: "bytes32" },
        { name: "ops", type: "Ops[]" },
      ],
      Ops: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
      GasRefund: [
        { name: "token", type: "address" },
        { name: "exchangeRate", type: "uint256" },
        { name: "overhead", type: "uint256" },
      ],
    },
    primaryType: "SingleChainOps",
    message: {
      account: hcaAddress,
      nonce: route.intentOp.nonce,
      op: { vt: pad("0x0201", { dir: "right" }), ops },
      gasRefund: route.intentOp.elements[0]?.mandate.qualifier.settlementContext.gasRefund,
    },
  }) as TypedDataDefinition;

describe("rhinestone executor: route checks", () => {
  const paymaster = defined(v2.hca).gasRefundPaymaster;
  const withFee = rhinestoneRoute({
    calls: [feeApproval(paymaster, refund.amount), call],
    refund,
  });

  it.effect("signs a route that runs the request after the fee approval", () =>
    Effect.gen(function* () {
      const { sdk, signed } = sdkAnswering(withFee, {
        origin: [intentMessage(withFee, [feeApproval(paymaster, refund.amount), call])],
        destination: intentMessage(withFee, [feeApproval(paymaster, refund.amount), call]),
      });

      const reference = yield* Effect.promise(() =>
        defined(rhinestone({ sdk }).send)(request, context()),
      );

      assert.strictEqual(reference, "1");
      assert.lengthOf(signed, 1);
    }),
  );

  const route = rhinestoneRoute({ calls: [call] });
  const [element] = route.intentOp.elements;
  const mandate = defined(element).mandate;
  it.effect.each<readonly [string, unknown]>([
    ["an extra call", rhinestoneRoute({ calls: [call, { ...call, data: "0x01" }] })],
    ["changed calldata", rhinestoneRoute({ calls: [{ ...call, data: "0xabce" }] })],
    ["no calls", rhinestoneRoute({ calls: [] })],
    ["another recipient", rhinestoneRoute({ calls: [call], hca: owner })],
    ["another sponsor", { ...route, intentOp: { ...route.intentOp, sponsor: owner } }],
    [
      "funding",
      {
        ...route,
        intentOp: {
          ...route.intentOp,
          elements: [{ ...element, idsAndAmounts: [[1n, 1n]] }],
        },
      },
    ],
    [
      "a refund over the cap",
      rhinestoneRoute({ calls: [call], refund: { ...refund, amount: 100_000_001n } }),
    ],
    [
      "a refund in another token",
      rhinestoneRoute({ calls: [call], refund: { ...refund, token: owner } }),
    ],
    [
      "a fee approval to another spender",
      rhinestoneRoute({ calls: [feeApproval(owner, refund.amount), call], refund }),
    ],
    [
      "another chain",
      {
        ...route,
        intentOp: {
          ...route.intentOp,
          elements: [{ ...element, mandate: { ...mandate, destinationChainId: 1n } }],
        },
      },
    ],
    ["an unknown shape", { intentOp: {} }],
  ])("refuses a route with %s, before signing", ([, tampered]) =>
    Effect.gen(function* () {
      const { sdk, signed } = sdkAnswering(tampered);

      const error = yield* expectRejection(
        () => defined(rhinestone({ sdk }).send)(request, context()),
        { _tag: "HcaError", code: "HCA_ROUTE_REJECTED" },
      );

      assert.isNotEmpty(Reflect.get(error, "details"));
      assert.lengthOf(signed, 0);
    }),
  );

  it.effect("refuses signing messages that differ from the route", () =>
    Effect.gen(function* () {
      const other = intentMessage(route, [{ ...call, data: "0x01" }]);
      const { sdk, signed } = sdkAnswering(route, { origin: [other], destination: other });

      yield* expectRejection(() => defined(rhinestone({ sdk }).send)(request, context()), {
        _tag: "HcaError",
        code: "HCA_ROUTE_REJECTED",
      });
      assert.lengthOf(signed, 0);
    }),
  );

  // The validator bounds a session's calls on chain; its refund is checked against the caps.
  it.effect("refuses a session refund above the session's caps, before signing", () =>
    Effect.gen(function* () {
      const session: HcaSession = {
        chainId: sepolia.id,
        hca: hcaAddress,
        owner,
        sessionKey: sessionSigner.address,
        terms: {
          sessionNonce: 0n,
          validUntil: 4_000_000_000,
          resolver: zeroAddress,
          refundToken: usdc,
          maxRefundExchangeRate: 2_000_000_000n,
          maxRefundGasOverhead: 40_000n,
          maxRefundAmount: 1_000_000n,
        },
        chains: [{ chainId: sepolia.id, sessionDigest: zeroHash }],
        permissionId: zeroHash,
        sessionDigest: zeroHash,
        ownerSignature: "0xabcd",
        signingDomain: "smart-session",
      };
      const { sdk, signed } = sdkAnswering(rhinestoneRoute({ calls: [call], refund }));

      const error = yield* expectRejection(
        () => defined(rhinestone({ sdk, sessionSigner }).send)({ ...request, session }, context()),
        { _tag: "HcaError", code: "HCA_SESSION_INVALID" },
      );

      assert.deepStrictEqual(Reflect.get(error, "details"), ["gas overhead 50000 > 40000"]);
      assert.lengthOf(signed, 0);
    }),
  );
});

describe("rhinestone executor: quotes", () => {
  // (gas limit 450k + 2 × 50k overhead) × 1 gwei × 1e9 / 1e18 = 550 000 units, under the cap.
  it.effect("prices an execution's refund from the route, at most its cap", () =>
    Effect.gen(function* () {
      const { sdk } = sdkAnswering(
        rhinestoneRoute({ calls: [call], refund, gasPrice: 1_000_000_000n, spent: 10n }),
      );
      const capped = sdkAnswering(
        rhinestoneRoute({
          calls: [call],
          refund: { ...refund, amount: 400_000n },
          gasPrice: 1_000_000_000n,
        }),
      );

      const fees = yield* Effect.promise(() =>
        defined(rhinestone({ sdk }).quote)(request, context()),
      );
      const cappedFees = yield* Effect.promise(() =>
        defined(rhinestone({ sdk: capped.sdk }).quote)(request, context()),
      );
      const quotedRefund = yield* Effect.promise(() =>
        defined(rhinestone({ sdk }).quoteRefund)(request, context()),
      );

      assert.deepStrictEqual(fees, [
        { kind: "execution", token: usdc, amount: 300_000n, maximum: 300_000n, sponsored: false },
      ]);
      assert.deepInclude(cappedFees[0], { amount: 400_000n, maximum: 400_000n });
      assert.deepStrictEqual(quotedRefund, refund);
    }),
  );

  it.effect("quotes a sponsored execution as free", () =>
    Effect.gen(function* () {
      const { sdk } = sdkAnswering(rhinestoneRoute({ calls: [call] }));

      const fees = yield* Effect.promise(() =>
        defined(rhinestone({ sdk, sponsored: true }).quote)(request, context()),
      );

      assert.deepStrictEqual(fees, [
        { kind: "execution", token: usdc, amount: 0n, maximum: 0n, sponsored: true },
      ]);
    }),
  );
});
